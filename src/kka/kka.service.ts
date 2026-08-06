// src/kka/kka.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKkaDto, UpdateKkaDto } from './dto/kka.dto';
import { StatusKka } from '@prisma/client';

@Injectable()
export class KkaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Membuat KKA baru.
   * Hanya diperbolehkan pada Surat Tugas yang berstatus AKTIF.
   */
  async createKka(dto: CreateKkaDto) {
    const st = await this.prisma.trSuratTugas.findUnique({
      where: { id: dto.stId },
    });
    if (!st) {
      throw new NotFoundException('Surat Tugas tidak ditemukan.');
    }

    if (st.statusSt !== 'AKTIF') {
      throw new ConflictException(
        'KKA hanya dapat dibuat untuk Surat Tugas yang aktif.',
      );
    }

    return this.prisma.trKka.create({
      data: {
        stId: dto.stId,
        prosedurPemeriksaan: dto.prosedurPemeriksaan,
        uraianPengujian: dto.uraianPengujian,
        kesimpulanSementara: dto.kesimpulanSementara,
        statusKka: 'DRAF',
      },
    });
  }

  /**
   * Mengubah isi KKA (selama belum disetujui / APPROVED).
   */
  async updateKka(id: string, dto: UpdateKkaDto) {
    const kka = await this.findOne(id);

    if (kka.statusKka === 'APPROVED') {
      throw new ConflictException(
        'Kertas Kerja Audit (KKA) sudah disetujui dan tidak dapat diubah.',
      );
    }

    return this.prisma.trKka.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Transisi status KKA (State Machine).
   * Peran dicek dari request.userTeamRole yang diisi oleh ContextualAuthGuard.
   */
  async updateStatus(id: string, newStatus: StatusKka, userTeamRole: string) {
    const kka = await this.findOne(id);

    // Aturan 1: Jika sudah disetujui (APPROVED), status tidak bisa diubah-ubah lagi
    if (kka.statusKka === 'APPROVED') {
      throw new ConflictException('KKA sudah disetujui secara permanen.');
    }

    // Aturan 2: Validasi peran berdasarkan transisi
    if (newStatus === 'APPROVED' || newStatus === 'REVISI') {
      // Hanya Ketua Tim (KT) atau Pimpinan (QC) yang boleh menyetujui / merevisi
      if (userTeamRole !== 'Ketua_Tim') {
        throw new ForbiddenException(
          'Hanya Ketua Tim yang memiliki wewenang untuk menyetujui atau merevisi KKA.',
        );
      }
    }

    if (newStatus === 'MENUNGGU_ULASAN') {
      // Anggota tim mengajukan ke Ketua Tim
      if (kka.statusKka !== 'DRAF' && kka.statusKka !== 'REVISI') {
        throw new ConflictException(
          'Hanya KKA berstatus Draf atau Revisi yang dapat diajukan untuk diulas.',
        );
      }
    }

    return this.prisma.trKka.update({
      where: { id },
      data: { statusKka: newStatus },
    });
  }

  /**
   * Mengambil semua KKA.
   */
  async findAll() {
    return this.prisma.trKka.findMany({
      include: {
        suratTugas: true,
      },
    });
  }

  /**
   * Mengambil satu KKA.
   */
  async findOne(id: string) {
    const kka = await this.prisma.trKka.findUnique({
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
      },
    });
    if (!kka) {
      throw new NotFoundException('Kertas Kerja Audit (KKA) tidak ditemukan.');
    }
    return kka;
  }

  /**
   * Menghapus KKA (hanya jika masih DRAF/REVISI).
   */
  async delete(id: string) {
    const kka = await this.findOne(id);
    if (kka.statusKka === 'APPROVED' || kka.statusKka === 'MENUNGGU_ULASAN') {
      throw new ConflictException(
        'KKA yang sedang diulas atau sudah disetujui tidak dapat dihapus.',
      );
    }
    return this.prisma.trKka.delete({ where: { id } });
  }
}
