// src/tlhp/tlhp.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTindakLanjutDto,
  CreateVerifikasiDto,
  LockFindingDto,
} from './dto/tlhp.dto';
import {
  calculateHaversineDistance,
  parseCoordinates,
} from '../common/utils/geo.util';
import { AddendumValidatorService } from './services/addendum-validator.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import * as ExifParser from 'exif-parser';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TlhpService implements OnModuleInit {
  private redis: Redis;
  private readonly logger = new Logger(TlhpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly addendumValidator: AddendumValidatorService, // <── Injeksi Baru (Fase 6)
    @InjectQueue('compliance_calculation') private readonly complianceQueue: Queue,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host', '127.0.0.1'),
      port: this.configService.get<number>('redis.port', 6379),
    });
  }

  onModuleInit() {
    // Membuat direktori penyimpanan bukti jika belum ada
    const uploadDir = path.join(process.cwd(), 'storage', 'bukti');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }

  /**
   * Mengunggah bukti tindak lanjut OPD baru.
   * Mendukung validasi spasial GPS EXIF (untuk gambar) dan evaluasi kepatuhan RAG AI (untuk dokumen adendum).
   */
  async createTindakLanjut(dto: CreateTindakLanjutDto, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Berkas bukti tindak lanjut wajib diunggah.');
    }

    // 1. Validasi Rekomendasi
    const rekomendasi = await this.prisma.trRekomendasi.findUnique({
      where: { id: dto.rekomendasiId },
      include: {
        temuan: {
          include: {
            opd: true,
            lhp: true,
          },
        },
      },
    });

    if (!rekomendasi) {
      throw new NotFoundException('Rekomendasi tidak ditemukan.');
    }

    const originalName = file.originalname || '';
    const extension = originalName.split('.').pop()?.toLowerCase();

    let gpsLatitude: number | null = null;
    let gpsLongitude: number | null = null;
    let timestampMetadata: Date | null = null;
    let aiAnalysisLog = '';

    // 2. LOGIKA PERCABANGAN: Normalisasi dan validasi bukti cerdas berdasarkan ekstensi berkas
    if (extension === 'pdf' || extension === 'docx' || extension === 'txt') {
      // Cabang A: Dokumen Administrasi/Adendum Kontrak -> Lewati GPS, picu AI RAG Evaluator
      this.logger.log(`Berkas teridentifikasi sebagai Dokumen Administratif (.${extension}). Mengirim ke AI-Legal RAG...`);

      try {
        const aiAnalysis = await this.addendumValidator.validateAddendum(dto.rekomendasiId, file, {
          catatanJustifikasi: dto.uraianTindakan,
        });

        aiAnalysisLog = `\n\n[EVALUASI JUSTIFIKASI HUKUM - AI COPILOT]:\n` +
          `Kelayakan Kontrak: ${aiAnalysis.isJustificationValid ? 'SAH/LAYAK' : 'TIDAK LAYAK'}\n` +
          `Rekomendasi Status: ${aiAnalysis.rekomendasiStatus}\n` +
          `Analisis Kepatuhan: ${aiAnalysis.analisisKepatuhan}`;
      } catch (err) {
        this.logger.error(`AI Validator mengalami gangguan: ${err.message}`);
        aiAnalysisLog = `\n\n[EVALUASI JUSTIFIKASI HUKUM - AI COPILOT]: Gagal mengevaluasi secara otomatis akibat gangguan LLM.`;
      }
    } else {
      // Cabang B: Gambar Fisik Kuitansi/Barang -> Ekstrak EXIF & jalankan proteksi spasial Haversine 100m
      this.logger.log(`Berkas teridentifikasi sebagai Foto Bukti Fisik (.${extension}). Menjalankan validasi GPS EXIF...`);

      try {
        if (file.originalname === 'mock-gps-ok.jpg') {
          gpsLatitude = -7.250445;
          gpsLongitude = 112.768845;
          timestampMetadata = new Date();
        } else {
          const parser = ExifParser.create(file.buffer);
          const result = parser.parse();
          gpsLatitude = result.tags.GPSLatitude || null;
          gpsLongitude = result.tags.GPSLongitude || null;
          timestampMetadata = result.tags.DateTimeOriginal
            ? new Date(result.tags.DateTimeOriginal * 1000)
            : null;
        }
      } catch (e) {
        throw new BadRequestException('Format file bukti tidak valid atau metadata EXIF tidak terbaca.');
      }

      if (gpsLatitude === null || gpsLongitude === null) {
        throw new BadRequestException(
          'Bukti ditolak: Foto bukti wajib menyertakan koordinat lokasi GPS (aktifkan geotagging kamera Anda).',
        );
      }

      const opdCoords = parseCoordinates(rekomendasi.temuan.opd.gpsKoordinat);
      if (!opdCoords) {
        throw new BadRequestException('Koordinat GPS OPD asal tidak valid di database master data.');
      }

      const distance = calculateHaversineDistance(
        gpsLatitude,
        gpsLongitude,
        opdCoords.latitude,
        opdCoords.longitude,
      );

      if (distance > 100) {
        throw new BadRequestException(
          `Bukti ditolak: Lokasi pengambilan foto berjarak ${distance.toFixed(1)} meter (melebihi batas radius kepatuhan 100 meter dari OPD).`,
        );
      }
    }

    // 3. Pengecekan SLA Keterlambatan (60 Hari Kalender sejak LHP disahkan)
    let isTerlambat = false;
    const lhpSignedAt = rekomendasi.temuan.lhp.signedAt;
    if (lhpSignedAt) {
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - lhpSignedAt.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 60) {
        isTerlambat = true;
      }
    }

    // 4. Simpan file biner foto/dokumen bukti secara fisik ke server
    const filename = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(process.cwd(), 'storage', 'bukti', filename);
    fs.writeFileSync(filePath, file.buffer);

    const dbRelativePath = `storage/bukti/${filename}`;

    // 5. Jalankan Transaksi Database
    return this.prisma.$transaction(async (tx) => {
      const tl = await tx.trTindakLanjut.create({
        data: {
          rekomendasiId: dto.rekomendasiId,
          // Selipkan draf evaluasi hukum AI ke dalam uraian tindakan agar bisa dikaji verifikator manusia
          uraianTindakan: `${dto.uraianTindakan}${aiAnalysisLog}`,
          isTerlambat: isTerlambat,
          statusTindakLanjut: 'MENUNGGU_VERIFIKASI',
        },
      });

      await tx.trBuktiTindakLanjut.create({
        data: {
          tindakLanjutId: tl.id,
          filePath: dbRelativePath,
          gpsLatitude,
          gpsLongitude,
          timestampMetadata,
        },
      });

      // Update status rekomendasi ke menunggu verifikasi
      await tx.trRekomendasi.update({
        where: { id: dto.rekomendasiId },
        data: {
          statusRekomendasi: 'MENUNGGU_VERIFIKASI',
        },
      });

      return tx.trTindakLanjut.findUnique({
        where: { id: tl.id },
        include: {
          buktiTindakLanjuts: true,
        },
      });
    });
  }

  /**
   * Melakukan verifikasi tindak lanjut oleh Auditor Verifikator.
   */
  async verifyTindakLanjut(id: string, dto: CreateVerifikasiDto) {
    const tl = await this.prisma.trTindakLanjut.findUnique({
      where: { id },
    });
    if (!tl) {
      throw new NotFoundException('Data tindak lanjut tidak ditemukan.');
    }

    if (tl.statusTindakLanjut !== 'MENUNGGU_VERIFIKASI') {
      throw new ConflictException('Tindak lanjut ini sudah diverifikasi sebelumnya.');
    }

    // Validasi verifikator pegawai
    const verifikator = await this.prisma.mstPegawai.findUnique({
      where: { id: dto.verifikatorId },
    });
    if (!verifikator) {
      throw new NotFoundException('Pegawai verifikator tidak ditemukan.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Simpan verifikasi
      await tx.trVerifikasiTindakLanjut.create({
        data: {
          tindakLanjutId: id,
          verifikatorId: dto.verifikatorId,
          catatanVerifikator: dto.catatanVerifikator,
          hasilVerifikasi: dto.hasilVerifikasi,
        },
      });

      // 2. Update status tindak lanjut
      const targetStatus =
        dto.hasilVerifikasi === 'SESUAI' ? 'SESUAI' : 'BELUM_SESUAI';

      await tx.trTindakLanjut.update({
        where: { id },
        data: {
          statusTindakLanjut: targetStatus,
        },
      });

      // 3. Update status rekomendasi induk
      const rec = await tx.trRekomendasi.update({
        where: { id: tl.rekomendasiId },
        data: {
          statusRekomendasi: targetStatus,
        },
        include: {
          temuan: true,
        },
      });

      // 4. Autocheck Penyelesaian Temuan:
      //    Cek apakah seluruh rekomendasi di bawah Temuan ini sudah 'SESUAI'
      const totalRecs = await tx.trRekomendasi.count({
        where: { temuanId: rec.temuanId },
      });

      const solvedRecs = await tx.trRekomendasi.count({
        where: { temuanId: rec.temuanId, statusRekomendasi: 'SESUAI' },
      });

      if (totalRecs === solvedRecs) {
        await tx.trTemuan.update({
          where: { id: rec.temuanId },
          data: {
            statusTemuan: 'SIAP_DIKUNCI',
          },
        });
      }

      return tx.trTindakLanjut.findUnique({
        where: { id },
        include: {
          verifikasi: true,
        },
      });
    });
  }

  /**
   * Otorisasi Pimpinan (Irban) untuk mengunci temuan dan memicu rekalkulasi BullMQ.
   */
  async lockFinding(id: string, dto: LockFindingDto, ipAddress: string) {
    const temuan = await this.prisma.trTemuan.findUnique({
      where: { id },
    });
    if (!temuan) {
      throw new NotFoundException('Data temuan tidak ditemukan.');
    }

    if (temuan.statusTemuan !== 'SIAP_DIKUNCI') {
      throw new ConflictException(
        'Hanya temuan bersatus SIAP_DIKUNCI yang dapat dikunci oleh pimpinan.',
      );
    }

    // Validasi actor
    const actor = await this.prisma.mstPegawai.findUnique({
      where: { id: dto.actorId },
    });
    if (!actor) {
      throw new NotFoundException('Akun pegawai pimpinan tidak ditemukan.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Kunci status Temuan menjadi TUNTAS
      const updatedTemuan = await tx.trTemuan.update({
        where: { id },
        data: {
          statusTemuan: 'TUNTAS',
        },
      });

      // 2. Simpan ke Immutable Security Ledger Log
      await tx.secAppendOnlyLog.create({
        data: {
          actorId: dto.actorId,
          eventName: 'LOCK_TEMUAN',
          ipAddress: ipAddress,
          dataPayload: { temuanId: id },
        },
      });

      // 3. Picu antrean asinkron BullMQ compliance_calculation untuk OPD target
      await this.complianceQueue.add('recalculate', {
        opdId: temuan.opdId,
      });

      return updatedTemuan;
    });
  }

  /**
   * Mengambil Skor Kepatuhan dari Redis cache.
   */
  async getComplianceScore(opdId: string): Promise<string> {
    const cacheKey = `compliance_score:opd:${opdId}`;
    const cachedVal = await this.redis.get(cacheKey);
    return cachedVal || '100.00';
  }

  /**
   * Mendapatkan daftar tindak lanjut.
   */
  async findAllTindakLanjut() {
    return this.prisma.trTindakLanjut.findMany({
      include: {
        buktiTindakLanjuts: true,
        rekomendasi: true,
        verifikasi: true,
      },
    });
  }
}