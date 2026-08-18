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
  UpdateAgendaDto,
  RejectPkptDto,
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

  // [FITUR BARU] Edit Agenda per-baris (Jika Kasubag menyesuaikan rincian data PKPT)
  async updateAgenda(id: string, dto: UpdateAgendaDto) {
    const agenda = await this.prisma.trAgendaAudit.findUnique({ 
      where: { id }, 
      include: { pkpt: true, suratTugas: true } 
    });
    if (!agenda) throw new NotFoundException('Agenda audit tidak ditemukan.');
    if (agenda.suratTugas && agenda.suratTugas.statusSt === 'AKTIF') {
      throw new ConflictException('Agenda tidak dapat diedit karena Surat Tugas aktif sedang berjalan di lapangan.');
    }

    const currentSubstansi = (agenda.substansiDokumen as object) || {};
    const mergedSubstansi = dto.substansiDokumen ? { ...currentSubstansi, ...dto.substansiDokumen } : currentSubstansi;

    return this.prisma.trAgendaAudit.update({
      where: { id },
      data: {
        jenisPengawasan: dto.jenisPengawasan || agenda.jenisPengawasan,
        perkiraanBulan: dto.perkiraanBulan || agenda.perkiraanBulan,
        estimasiAnggaran: dto.estimasiAnggaran !== undefined ? dto.estimasiAnggaran : agenda.estimasiAnggaran,
        substansiDokumen: Object.keys(mergedSubstansi).length > 0 ? mergedSubstansi : undefined,
      },
      include: {
        opd: true,
      },
    });
  }

  // [FITUR BARU] Mengajukan ke Inspektur (DRAF -> MENUNGGU_PERSETUJUAN)
  async submitPkpt(id: string) {
    const pkpt = await this.prisma.trPkpt.findUnique({ where: { id } });
    if (!pkpt) throw new NotFoundException('PKPT tidak ditemukan.');
    if (pkpt.statusPkpt !== 'DRAF') throw new ConflictException('Hanya DRAF yang bisa diajukan.');

    return this.prisma.trPkpt.update({
      where: { id },
      data: { statusPkpt: 'MENUNGGU_PERSETUJUAN' },
    });
  }

  // [FITUR BARU] Penolakan oleh Inspektur (MENUNGGU_PERSETUJUAN -> DRAF)
  async rejectPkpt(id: string, dto: RejectPkptDto) {
    const pkpt = await this.prisma.trPkpt.findUnique({ where: { id } });
    if (!pkpt) throw new NotFoundException('PKPT tidak ditemukan.');
    if (pkpt.statusPkpt !== 'MENUNGGU_PERSETUJUAN') {
      throw new ConflictException('Hanya PKPT yang sedang diajukan yang dapat ditolak.');
    }

    const currentSubstansi = (pkpt.substansiDokumen as object) || {};
    return this.prisma.trPkpt.update({
      where: { id },
      data: { 
        statusPkpt: 'DRAF',
        substansiDokumen: { ...currentSubstansi, catatanRevisi: dto.catatanRevisi }
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

    if (pkpt.statusPkpt !== 'MENUNGGU_PERSETUJUAN') {
      throw new ConflictException('Hanya PKPT yang diajukan yang bisa disetujui.');
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
      include: { approvedBy: true, agendaAudits: { include: { opd: true } } },
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
