// src/lhp/lhp.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLhpDto, SignLhpDto } from './dto/lhp.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { StatusRekomendasi, StatusTemuan, SumberPembuatan } from '@prisma/client';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class LhpService {
  private queueEvents: QueueEvents;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue('lhp_generation') private readonly lhpQueue: Queue,
  ) {
    // Setup listener untuk antrean BullMQ
    const redisHost = this.configService.get<string>('redis.host', '127.0.0.1');
    const redisPort = this.configService.get<number>('redis.port', 6379);

    this.queueEvents = new QueueEvents('lhp_generation', {
      connection: { host: redisHost, port: redisPort },
    });
  }

  /**
   * Membuat draf LHP. Proses penyusunan file LHP dilakukan via BullMQ.
   */
  async createLhp(dto: CreateLhpDto) {
    // 1. Validasi Surat Tugas
    const st = await this.prisma.trSuratTugas.findUnique({
      where: { id: dto.stId },
      include: { lhp: true },
    });
    if (!st) {
      throw new NotFoundException('Surat Tugas tidak ditemukan.');
    }

    if (st.statusSt !== 'AKTIF') {
      throw new ConflictException(
        'LHP hanya dapat dibuat jika Surat Tugas berstatus AKTIF.',
      );
    }

    if (st.lhp) {
      throw new ConflictException(
        `LHP untuk Surat Tugas ini sudah pernah dibuat (LHP ID: ${st.lhp.id}).`,
      );
    }

    // 2. Validasi KKA APPROVED
    const approvedKkas = await this.prisma.trKka.findMany({
      where: {
        stId: dto.stId,
        statusKka: 'APPROVED',
      },
    });
    if (approvedKkas.length === 0) {
      throw new BadRequestException(
        'LHP tidak dapat dibuat karena belum ada Kertas Kerja Audit (KKA) yang disetujui (APPROVED).',
      );
    }

    // 3. Tambahkan job kompilasi dokumen ke antrean BullMQ
    const job = await this.lhpQueue.add('compile_lhp', {
      stId: dto.stId,
      nomorLhp: dto.nomorLhp,
      ringkasanEksekutif: dto.ringkasanEksekutif,
    });

    // 4. Tunggu job selesai di latar belakang
    const jobResult = await job.waitUntilFinished(this.queueEvents);
    const fileLhpSignedPath = jobResult.filePath;

    // 5. Simpan LHP beserta Temuan & Rekomendasi ke Database
    return this.prisma.$transaction(async (tx) => {
      // Periksa apakah sudah ada TrLhp untuk ST ini (mis. draf NHP dari AI)
      const existingLhp = await tx.trLhp.findFirst({
        where: { stId: dto.stId },
      });

      if (existingLhp && existingLhp.signedAt) {
        // Jika sudah ada dan sudah disahkan, maka bentrok
        throw new ConflictException(
          `LHP untuk Surat Tugas ini sudah pernah dibuat (LHP ID: ${existingLhp.id}).`,
        );
      }

      // Jika sudah ada tetapi belum disahkan (draf NHP), lakukan update
      let lhp;
      if (existingLhp) {
        lhp = await tx.trLhp.update({
          where: { id: existingLhp.id },
          data: {
            nomorLhp: dto.nomorLhp,
            ringkasanEksekutif: dto.ringkasanEksekutif,
            fileLhpSignedPath: fileLhpSignedPath,
            // pertahankan substansiNhp jika ada
            substansiNhp: existingLhp.substansiNhp || undefined,
            sumberPembuatan: existingLhp.sumberPembuatan || SumberPembuatan.SYSTEM,
          },
        });
      } else {
        // Tidak ada draf sebelumnya -> buat baru
        lhp = await tx.trLhp.create({
          data: {
            stId: dto.stId,
            nomorLhp: dto.nomorLhp,
            ringkasanEksekutif: dto.ringkasanEksekutif,
            fileLhpSignedPath: fileLhpSignedPath,
            substansiNhp: undefined,
            sumberPembuatan: SumberPembuatan.SYSTEM,
          },
        });
      }

      // Simpan Temuan dan Rekomendasi
      for (const t of dto.temuan) {
        const temuan = await tx.trTemuan.create({
          data: {
            lhpId: lhp.id,
            kkaId: t.kkaId,
            opdId: t.opdId,
            kondisi: t.kondisi,
            kriteria: t.kriteria,
            sebab: t.sebab,
            akibat: t.akibat,
            statusTemuan: StatusTemuan.PROSES, // Status default saat draf LHP dibuat
          },
        });

        const rekomendasiData = t.rekomendasis.map((r) => ({
          temuanId: temuan.id,
          uraianRekomendasi: r.uraianRekomendasi,
          nilaiTuntutanFinansial: r.nilaiTuntutanFinansial,
          statusRekomendasi: StatusRekomendasi.BELUM_TINDAK_LANJUT,
        }));

        await tx.trRekomendasi.createMany({
          data: rekomendasiData,
        });
      }

      // Hubungkan KKA dengan LHP
      await tx.trKka.updateMany({
        where: {
          stId: dto.stId,
          statusKka: 'APPROVED',
        },
        data: {
          lhpId: lhp.id,
        },
      });

      return tx.trLhp.findUnique({
        where: { id: lhp.id },
        include: {
          kkas: true,
          temuan: {
            include: {
              rekomendasis: true,
            },
          },
        },
      });
    });
  }

  /**
   * Menandatangani LHP secara elektronik (TTE) via SHA-256.
   * Mengubah status Surat Tugas ke SELESAI.
   */
  async signLhp(id: string, dto: SignLhpDto) {
    const lhp = await this.prisma.trLhp.findUnique({
      where: { id },
      include: {
        suratTugas: true,
      },
    });

    if (!lhp) {
      throw new NotFoundException('Laporan Hasil Pemeriksaan (LHP) tidak ditemukan.');
    }

    if (lhp.signedAt) {
      throw new ConflictException('LHP ini sudah ditandatangani sebelumnya.');
    }

    // 1. Kriptografi TTE SHA-256
    const hash = crypto.createHash('sha256');
    hash.update(lhp.ringkasanEksekutif + dto.digitalCertificate);
    const signatureHash = hash.digest('hex');

    // 2. Sematkan TTE signature pada berkas fisik LHP
    const physicalPath = path.join(process.cwd(), lhp.fileLhpSignedPath);
    if (fs.existsSync(physicalPath)) {
      let fileContent = fs.readFileSync(physicalPath, 'utf-8');
      fileContent += `\n========================================================\n`;
      fileContent += `TANDA TANGAN ELEKTRONIK (TTE) RESMI\n`;
      fileContent += `Ditandatangani Oleh : INSPEKTUR DAERAH\n`;
      fileContent += `Tanggal Pengesahan  : ${new Date().toISOString()}\n`;
      fileContent += `Kode Sertifikat     : ${dto.digitalCertificate.substring(0, 4)}***\n`;
      fileContent += `Digital Hash SHA256 : ${signatureHash}\n`;
      fileContent += `========================================================\n`;
      fs.writeFileSync(physicalPath, fileContent, 'utf-8');
    }

    // 3. Update Database (Sahkan LHP & Ubah status Surat Tugas ke SELESAI)
    return this.prisma.$transaction(async (tx) => {
      // Update LHP signed status
      const updatedLhp = await tx.trLhp.update({
        where: { id },
        data: {
          signedAt: new Date(),
        },
        include: {
          temuan: {
            include: {
              rekomendasis: true,
            },
          },
        },
      });

      // Pemicu Otomatis: Ubah status Surat Tugas ke SELESAI
      await tx.trSuratTugas.update({
        where: { id: lhp.stId },
        data: {
          statusSt: 'SELESAI',
        },
      });

      return {
        message: 'LHP berhasil disahkan dengan TTE SHA-256.',
        lhp: updatedLhp,
        tteHash: signatureHash,
      };
    });
  }

  /**
   * Mengambil semua LHP.
   */
  async findAll() {
    return this.prisma.trLhp.findMany({
      include: {
        suratTugas: true,
        temuan: {
          include: {
            rekomendasis: true,
            opd: true,
          },
        },
      },
      orderBy: { signedAt: 'desc' },
    });
  }

  /**
   * Mengambil detail satu LHP.
   */
  async findOne(id: string) {
    const lhp = await this.prisma.trLhp.findUnique({
      where: { id },
      include: {
        suratTugas: {
          include: {
            stAuditors: {
              include: {
                auditor: true,
              },
            },
          },
        },
        temuan: {
          include: {
            rekomendasis: true,
            opd: true,
          },
        },
      },
    });
    if (!lhp) {
      throw new NotFoundException('LHP tidak ditemukan.');
    }
    return lhp;
  }
}