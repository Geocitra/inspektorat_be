// src/audit-planning/audit-planning.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePkptDto,
  CreateAgendaDto,
  ApprovePkptDto,
} from './dto/pkpt.dto';
import { SumberPembuatan } from '@prisma/client';

@Injectable()
export class AuditPlanningService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Membuat draf PKPT baru.
   */
  async createPkpt(dto: CreatePkptDto, sumberPembuatan: SumberPembuatan = SumberPembuatan.SYSTEM, substansiDokumen: any = null) {
    const existing = await this.prisma.trPkpt.findUnique({
      where: { tahunAnggaran: dto.tahunAnggaran },
    });
    if (existing) {
      throw new ConflictException(
        `PKPT untuk tahun anggaran ${dto.tahunAnggaran} sudah terdaftar.`,
      );
    }

    return this.prisma.trPkpt.create({
      data: {
        tahunAnggaran: dto.tahunAnggaran,
        statusPkpt: 'DRAF',
        sumberPembuatan,
        substansiDokumen: substansiDokumen || undefined,
      },
    });
  }

  /**
   * Menambahkan agenda audit ke dalam PKPT.
   * Hanya diperbolehkan jika status PKPT masih DRAF.
   */
  async createAgenda(dto: CreateAgendaDto, sumberPembuatan: SumberPembuatan = SumberPembuatan.SYSTEM, substansiDokumen: any = null) {
    const pkpt = await this.prisma.trPkpt.findUnique({
      where: { id: dto.pkptId },
    });
    if (!pkpt) {
      throw new NotFoundException('PKPT tidak ditemukan.');
    }

    if (pkpt.statusPkpt !== 'DRAF') {
      throw new ConflictException(
        'Agenda tidak dapat ditambahkan karena PKPT sudah dikunci/disetujui.',
      );
    }

    // Validasi OPD
    const opd = await this.prisma.mstOpd.findUnique({
      where: { id: dto.opdId },
    });
    if (!opd) {
      throw new NotFoundException('OPD target tidak ditemukan.');
    }

    return this.prisma.trAgendaAudit.create({
      data: {
        pkptId: dto.pkptId,
        opdId: dto.opdId,
        jenisPengawasan: dto.jenisPengawasan,
        perkiraanBulan: dto.perkiraanBulan,
        estimasiAnggaran: dto.estimasiAnggaran,
        sumberPembuatan,
        substansiDokumen: substansiDokumen || undefined,
      },
      include: {
        opd: true,
      },
    });
  }

  /**
   * Menyetujui dan mengunci PKPT tahunan.
   */
  async approvePkpt(id: string, dto: ApprovePkptDto) {
    const pkpt = await this.prisma.trPkpt.findUnique({
      where: { id },
    });
    if (!pkpt) {
      throw new NotFoundException('PKPT tidak ditemukan.');
    }

    if (pkpt.statusPkpt !== 'DRAF') {
      throw new ConflictException('Hanya draf PKPT yang bisa disetujui.');
    }

    // Validasi Inspektur (Auditor/Pegawai)
    const inspektur = await this.prisma.mstPegawai.findUnique({
      where: { id: dto.approvedByInspekturId },
    });
    if (!inspektur) {
      throw new NotFoundException(
        'Pegawai Inspektur yang menyetujui tidak ditemukan.',
      );
    }

    return this.prisma.trPkpt.update({
      where: { id },
      data: {
        statusPkpt: 'DISETUJUI',
        approvedByInspekturId: dto.approvedByInspekturId,
        approvedAt: new Date(),
      },
      include: {
        approvedBy: true,
        agendaAudits: {
          include: {
            opd: true,
          },
        },
      },
    });
  }

  /**
   * Mengambil semua PKPT.
   */
  async findAllPkpt() {
    return this.prisma.trPkpt.findMany({
      orderBy: { tahunAnggaran: 'desc' },
      include: {
        approvedBy: true,
      },
    });
  }

  /**
   * Detail PKPT beserta agenda didalamnya.
   */
  async findOnePkpt(id: string) {
    const pkpt = await this.prisma.trPkpt.findUnique({
      where: { id },
      include: {
        approvedBy: true,
        agendaAudits: {
          include: {
            opd: true,
            suratTugas: true,
          },
        },
      },
    });
    if (!pkpt) {
      throw new NotFoundException('PKPT tidak ditemukan.');
    }
    return pkpt;
  }

  /**
   * Mengambil semua agenda audit.
   */
  async findAllAgenda() {
    return this.prisma.trAgendaAudit.findMany({
      include: {
        opd: true,
        pkpt: true,
        suratTugas: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
