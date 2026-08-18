// src/opd/opd.service.ts
// Business logic untuk manajemen data OPD (Organisasi Perangkat Daerah).
// Menggunakan Prisma untuk akses database dengan penanganan error yang proper.

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpdDto, UpdateOpdDto } from './dto/opd.dto';

@Injectable()
export class OpdService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Membuat data OPD baru.
   * Mencegah duplikasi nama OPD menggunakan unique constraint.
   */
  async create(dto: CreateOpdDto) {
    const existing = await this.prisma.mstOpd.findUnique({
      where: { namaOpd: dto.namaOpd },
    });
    if (existing) {
      throw new ConflictException(
        `OPD dengan nama "${dto.namaOpd}" sudah terdaftar di sistem.`,
      );
    }
    return this.prisma.mstOpd.create({
      data: {
        namaOpd: dto.namaOpd,
        alamat: dto.alamat,
        gpsKoordinat: dto.gpsKoordinat,
      },
    });
  }

  /**
   * Mengambil seluruh data OPD, diurutkan berdasarkan nama.
   */
  async findAll() {
    return this.prisma.mstOpd.findMany({
      include: {
        documents: true,
        agendaAudits: true,
      },
      orderBy: { namaOpd: 'asc' },
    });
  }

  /**
   * Mengambil satu data OPD berdasarkan ID.
   * Melempar NotFoundException jika tidak ditemukan.
   */
  async findOne(id: string) {
    const opd = await this.prisma.mstOpd.findUnique({ 
      where: { id },
      include: {
        documents: true,
        agendaAudits: true,
      },
    });
    if (!opd) {
      throw new NotFoundException(`OPD dengan ID "${id}" tidak ditemukan.`);
    }
    return opd;
  }

  /**
   * Memperbarui data OPD. Memvalidasi keberadaan OPD terlebih dahulu.
   */
  async update(id: string, dto: UpdateOpdDto) {
    await this.findOne(id); // Validasi keberadaan
    return this.prisma.mstOpd.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Menghapus data OPD.
   * Akan gagal (ConflictException) jika masih ada pegawai terikat
   * karena constraint ON DELETE RESTRICT di database.
   */
  async delete(id: string) {
    await this.findOne(id); // Validasi keberadaan
    try {
      return await this.prisma.mstOpd.delete({ where: { id } });
    } catch {
      throw new ConflictException(
        'Gagal menghapus OPD. Pastikan tidak ada pegawai atau data terkait yang masih aktif.',
      );
    }
  }
}
