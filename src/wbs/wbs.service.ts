// src/wbs/wbs.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import {
  CreateWbsAduanDto,
  TriageComplaintDto,
  SendChatDto,
  ApproveRekomendasiDto,
} from './dto/wbs.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WbsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  onModuleInit() {
    // Membuat direktori penyimpanan file bukti WBS terenkripsi jika belum ada
    const wbsDir = path.join(process.cwd(), 'storage', 'wbs');
    if (!fs.existsSync(wbsDir)) {
      fs.mkdirSync(wbsDir, { recursive: true });
    }
  }

  /**
   * Mengirim pengaduan anonim baru.
   * Mengenkripsi deskripsi aduan (AES-256-GCM) & file bukti, serta mengembalikan token pelacakan acak.
   */
  async submitWbsComplaint(dto: CreateWbsAduanDto, files: Express.Multer.File[]) {
    // 1. Generate token pelacakan unik acak (bukan sekuensial)
    const tokenPelacakan = this.crypto.generateWbsToken();

    // 2. Enkripsi deskripsi aduan
    const encryptedDescription = this.crypto.encryptText(dto.deskripsi);

    return this.prisma.$transaction(async (tx) => {
      // 3. Simpan aduan WBS ke database
      const aduan = await tx.wbsAduan.create({
        data: {
          tokenPelacakan,
          kategori: dto.kategori,
          deskripsi: encryptedDescription,
          status: 'Diterima',
        },
      });

      // 4. Simpan berkas bukti secara terenkripsi di folder aman
      if (files && files.length > 0) {
        for (const file of files) {
          const encryptedBuffer = this.crypto.encryptBuffer(file.buffer);
          
          const filename = `${Date.now()}-${file.originalname}`;
          const filePath = path.join(process.cwd(), 'storage', 'wbs', filename);
          fs.writeFileSync(filePath, encryptedBuffer);

          const dbRelativePath = `storage/wbs/${filename}`;

          await tx.wbsBukti.create({
            data: {
              wbsAduanId: aduan.id,
              filePath: dbRelativePath,
            },
          });
        }
      }

      return { tokenPelacakan };
    });
  }

  /**
   * Melacak aduan WBS berdasarkan token pelacakan unik.
   * Mengembalikan deskripsi yang telah didekripsi kembali.
   */
  async trackComplaint(token: string) {
    const aduan = await this.prisma.wbsAduan.findUnique({
      where: { tokenPelacakan: token },
      include: {
        buktiWbs: true,
      },
    });

    if (!aduan) {
      throw new NotFoundException('Token pelacakan tidak valid atau aduan tidak ditemukan.');
    }

    // Dekripsi deskripsi untuk pelapor
    const decryptedDesc = this.crypto.decryptText(aduan.deskripsi);

    return {
      ...aduan,
      deskripsi: decryptedDesc,
    };
  }

  /**
   * Penelaahan (Triage) aduan oleh Investigator.
   */
  async triageComplaint(id: string, dto: TriageComplaintDto) {
    const aduan = await this.prisma.wbsAduan.findUnique({
      where: { id },
    });
    if (!aduan) {
      throw new NotFoundException('Aduan WBS tidak ditemukan.');
    }

    // Validasi penelaah pegawai
    const penelaah = await this.prisma.mstPegawai.findUnique({
      where: { id: dto.penelaahId },
    });
    if (!penelaah) {
      throw new NotFoundException('Pegawai penelaah tidak ditemukan.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.keputusan === 'Klarifikasi_Dibutuhkan') {
        // Set status WBS
        await tx.wbsAduan.update({
          where: { id },
          data: { status: 'Butuh_Klarifikasi' },
        });

        // Simpan pesan klarifikasi awal di obrolan anonim
        await tx.wbsChat.create({
          data: {
            wbsAduanId: id,
            sender: 'Investigator',
            pesan: dto.catatanPenelaah,
          },
        });
      } else if (dto.keputusan === 'Diarsipkan_Tolak') {
        await tx.wbsAduan.update({
          where: { id },
          data: {
            status: 'Arsip',
            catatanAkhir: dto.catatanPenelaah,
          },
        });
      } else if (dto.keputusan === 'Rekomendasi_Audit') {
        await tx.wbsAduan.update({
          where: { id },
          data: { status: 'Penyelidikan' },
        });

        // Buat usulan rekomendasi penugasan investigasi khusus
        await tx.trRekomendasiPenugasanKhusus.create({
          data: {
            wbsAduanId: id,
            judul: `Audit Investigatif atas dugaan kasus WBS - ${aduan.kategori}`,
            rekomendatorId: dto.penelaahId,
            status: 'Menunggu_Otorisasi_Pimpinan',
          },
        });
      }

      return tx.wbsAduan.findUnique({
        where: { id },
        include: {
          rekomendasiPenugasan: true,
          chats: true,
        },
      });
    });
  }

  /**
   * Mengirim pesan chat baru ke utas aduan anonim.
   */
  async sendChat(id: string, dto: SendChatDto) {
    const aduan = await this.prisma.wbsAduan.findUnique({
      where: { id },
    });
    if (!aduan) {
      throw new NotFoundException('Aduan WBS tidak ditemukan.');
    }

    // Jika pelapor mengirim chat, token pelacakan harus sesuai untuk autentikasi
    if (dto.sender === 'Whistleblower') {
      if (!dto.tokenPelacakan || dto.tokenPelacakan !== aduan.tokenPelacakan) {
        throw new ForbiddenException(
          'Token pelacakan tidak valid. Akses obrolan anonim ditolak.',
        );
      }
    }

    return this.prisma.wbsChat.create({
      data: {
        wbsAduanId: id,
        sender: dto.sender,
        pesan: dto.pesan,
      },
    });
  }

  /**
   * Mengambil riwayat obrolan aduan WBS.
   */
  async getChatHistory(id: string, tokenPelacakan?: string) {
    const aduan = await this.prisma.wbsAduan.findUnique({
      where: { id },
    });
    if (!aduan) {
      throw new NotFoundException('Aduan WBS tidak ditemukan.');
    }

    // Jika diakses oleh whistleblower, validasi token
    if (tokenPelacakan && tokenPelacakan !== aduan.tokenPelacakan) {
      throw new ForbiddenException('Token pelacakan tidak valid.');
    }

    return this.prisma.wbsChat.findMany({
      where: { wbsAduanId: id },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Persetujuan rekomendasi audit khusus oleh Inspektur (Pimpinan).
   * Otomatis melahirkan draf Surat Tugas baru di Klaster A (Audit Engine) dengan conflict checking.
   */
  async approveRekomendasi(rekomendasiId: string, dto: ApproveRekomendasiDto) {
    const rekomendasi = await this.prisma.trRekomendasiPenugasanKhusus.findUnique({
      where: { id: rekomendasiId },
    });
    if (!rekomendasi) {
      throw new NotFoundException('Rekomendasi penugasan khusus tidak ditemukan.');
    }

    if (rekomendasi.status !== 'Menunggu_Otorisasi_Pimpinan') {
      throw new ConflictException('Status rekomendasi ini sudah diproses sebelumnya.');
    }

    // Validasi Inspektur
    const inspektur = await this.prisma.mstPegawai.findUnique({
      where: { id: dto.approvedById },
    });
    if (!inspektur) {
      throw new NotFoundException('Pegawai Inspektur tidak ditemukan.');
    }

    const start = new Date(dto.tanggalMulai);
    const end = new Date(dto.tanggalSelesai);

    return this.prisma.$transaction(async (tx) => {
      // 1. Conflict Checker untuk tim auditor yang diajukan
      for (const aud of dto.auditors) {
        const hasConflict = await tx.relStAuditor.findFirst({
          where: {
            auditorId: aud.auditorId,
            suratTugas: {
              statusSt: 'AKTIF',
              tanggalMulai: { lte: end },
              tanggalSelesai: { gte: start },
            },
          },
        });

        if (hasConflict) {
          throw new ConflictException(
            `Auditor dengan ID ${aud.auditorId} memiliki jadwal penugasan aktif lain pada rentang tersebut.`,
          );
        }
      }

      // 2. Update status rekomendasi penugasan khusus menjadi DISETUJUI
      await tx.trRekomendasiPenugasanKhusus.update({
        where: { id: rekomendasiId },
        data: { status: 'DISETUJUI' },
      });

      // 3. Buat draf Surat Tugas baru di Klaster A
      const st = await tx.trSuratTugas.create({
        data: {
          nomorSt: dto.nomorSt,
          tanggalMulai: start,
          tanggalSelesai: end,
          statusSt: 'DRAF',
          rekomendasiPenugasanKhususId: rekomendasiId,
        },
      });

      // 4. Hubungkan tim auditor
      for (const aud of dto.auditors) {
        await tx.relStAuditor.create({
          data: {
            stId: st.id,
            auditorId: aud.auditorId,
            peranDalamTim: aud.peranDalamTim,
          },
        });
      }

      return tx.trSuratTugas.findUnique({
        where: { id: st.id },
        include: {
          stAuditors: true,
          rekomendasiPenugasanKhusus: true,
        },
      });
    });
  }

  /**
   * Menampilkan semua aduan WBS.
   */
  async findAllAduan() {
    const list = await this.prisma.wbsAduan.findMany({
      include: {
        buktiWbs: true,
        rekomendasiPenugasan: true,
      },
    });

    // Dekripsi deskripsi saat didaftarkan agar investigator bisa membaca
    return list.map((a) => {
      try {
        return {
          ...a,
          deskripsi: this.crypto.decryptText(a.deskripsi),
        };
      } catch (err) {
        return a;
      }
    });
  }
}
