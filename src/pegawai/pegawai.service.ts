// src/pegawai/pegawai.service.ts
// Business logic untuk manajemen data Pegawai.
// Fitur utama: CRUD manual + Sinkronisasi UPSERT dari server BKD.

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePegawaiDto,
  UpdatePegawaiDto,
  SyncPegawaiDto,
} from './dto/pegawai.dto';

@Injectable()
export class PegawaiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Membuat data pegawai baru secara manual.
   * Mencegah duplikasi NIP menggunakan unique constraint.
   */
  async create(dto: CreatePegawaiDto) {
    // Cek duplikasi NIP
    const existing = await this.prisma.mstPegawai.findUnique({
      where: { nip: dto.nip },
    });
    if (existing) {
      throw new ConflictException(`NIP "${dto.nip}" sudah terdaftar di sistem.`);
    }

    // Validasi bahwa OPD yang ditunjuk benar-benar ada
    const opd = await this.prisma.mstOpd.findUnique({ where: { id: dto.opdId } });
    if (!opd) {
      throw new NotFoundException(
        `OPD dengan ID "${dto.opdId}" tidak ditemukan. Pastikan OPD sudah terdaftar terlebih dahulu.`,
      );
    }

    return this.prisma.mstPegawai.create({
      data: {
        nip: dto.nip,
        nama: dto.nama,
        golongan: dto.golongan,
        jabatan: dto.jabatan,
        unitKerja: dto.unitKerja || 'IRBAN_1',
        isAuditorLapangan: dto.isAuditorLapangan !== undefined ? dto.isAuditorLapangan : true,
        opdId: dto.opdId,
        sumberData: 'MANUAL',
      },
      include: { opd: true },
    });
  }

  /**
   * SINKRONISASI INTEGRASI BKD — Operasi UPSERT.
   * Logika:
   *   - Jika NIP sudah ada → UPDATE data pegawai tersebut
   *   - Jika NIP belum ada → CREATE pegawai baru
   * OPD dicocokkan berdasarkan NAMA OPD (bukan UUID) karena BKD tidak kenal UUID kita.
   */
  async syncFromBkd(dto: SyncPegawaiDto) {
    // Cari OPD berdasarkan nama persis seperti yang dikirim BKD
    const opd = await this.prisma.mstOpd.findUnique({
      where: { namaOpd: dto.namaOpdAsal },
    });

    if (!opd) {
      throw new BadRequestException(
        `Gagal sinkronisasi: OPD dengan nama "${dto.namaOpdAsal}" tidak terdaftar di sistem APIP Suite. ` +
          `Pastikan nama OPD di BKD sama persis dengan yang ada di sistem (case-sensitive).`,
      );
    }

    // UPSERT: Update jika ada, Create jika belum ada
    return this.prisma.mstPegawai.upsert({
      where: { nip: dto.nip },
      update: {
        nama: dto.nama,
        golongan: dto.golongan,
        jabatan: dto.jabatan,
        opdId: opd.id,
        sumberData: 'SINKRONISASI_BKD',
        terakhirDisinkronkan: new Date(),
      },
      create: {
        nip: dto.nip,
        nama: dto.nama,
        golongan: dto.golongan,
        jabatan: dto.jabatan,
        opdId: opd.id,
        sumberData: 'SINKRONISASI_BKD',
        terakhirDisinkronkan: new Date(),
      },
      include: { opd: true },
    });
  }

  /**
   * Mengambil seluruh data pegawai, include nama OPD dan penugasan aktif.
   */
  async findAll() {
    return this.prisma.mstPegawai.findMany({
      include: { 
        opd: true,
        stAuditors: {
          where: {
            suratTugas: { statusSt: 'AKTIF' }
          },
          include: {
            suratTugas: {
              include: {
                agendaAudit: {
                  include: { opd: true }
                }
              }
            }
          }
        }
      },
      orderBy: { nama: 'asc' },
    });
  }

  /**
   * Mengambil satu data pegawai berdasarkan UUID internal.
   */
  async findOne(id: string) {
    const pegawai = await this.prisma.mstPegawai.findUnique({
      where: { id },
      include: { opd: true },
    });
    if (!pegawai) {
      throw new NotFoundException(`Pegawai dengan ID "${id}" tidak ditemukan.`);
    }
    return pegawai;
  }

  /**
   * Memperbarui data pegawai secara parsial.
   */
  async update(id: string, dto: UpdatePegawaiDto) {
    await this.findOne(id); // Validasi keberadaan
    return this.prisma.mstPegawai.update({
      where: { id },
      data: dto,
      include: { opd: true },
    });
  }

  /**
   * Menghapus data pegawai.
   */
  async delete(id: string) {
    await this.findOne(id); // Validasi keberadaan
    return this.prisma.mstPegawai.delete({ where: { id } });
  }
}
