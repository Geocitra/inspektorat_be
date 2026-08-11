// src/assignment/assignment.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStDto, SignStDto } from './dto/st.dto';

@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Membuat draf Surat Tugas baru (Status: DRAF).
   * Menjalankan Conflict Checker untuk mendeteksi tumpukan jadwal.
   */
  async createSt(dto: CreateStDto) {
    const startDate = new Date(dto.tanggalMulai);
    const endDate = new Date(dto.tanggalSelesai);

    // 1. Validasi Agenda Audit (jika di-link dari PKPT rutin)
    if (dto.agendaAuditId) {
      const agenda = await this.prisma.trAgendaAudit.findUnique({
        where: { id: dto.agendaAuditId },
        include: { pkpt: true },
      });
      if (!agenda) {
        throw new NotFoundException('Agenda audit tidak ditemukan.');
      }
      if (agenda.pkpt.statusPkpt !== 'DISETUJUI') {
        throw new ConflictException(
          'Surat Tugas tidak dapat dibuat karena PKPT agenda ini belum disetujui Inspektur.',
        );
      }

      // Cek apakah agenda ini sudah pernah dikaitkan ke ST lain
      const existingSt = await this.prisma.trSuratTugas.findUnique({
        where: { agendaAuditId: dto.agendaAuditId },
      });
      if (existingSt) {
        throw new ConflictException(
          `Surat Tugas untuk agenda audit ini sudah pernah diterbitkan (ST ID: ${existingSt.id}).`,
        );
      }
    }

    // 2. Validasi Tim: Pengawas Teknis (1), Ketua Tim (1), Anggota Tim (>= 1)
    const auditors = dto.auditors;
    const hasPt = auditors.some((a) => a.peranDalamTim === 'Pengawas_Teknis');
    const hasKt = auditors.some((a) => a.peranDalamTim === 'Ketua_Tim');
    const hasAt = auditors.some((a) => a.peranDalamTim === 'Anggota_Tim');

    if (!hasPt) {
      throw new BadRequestException('Tim harus memiliki minimal 1 Pengawas Teknis.');
    }
    if (!hasKt) {
      throw new BadRequestException('Tim harus memiliki minimal 1 Ketua Tim.');
    }
    if (!hasAt) {
      throw new BadRequestException('Tim harus memiliki minimal 1 Anggota Tim.');
    }

    // 3. Algoritma Conflict Checker (Deteksi bentrok jadwal auditor pada ST aktif)
    const auditorIds = auditors.map((a) => a.auditorId);
    await this.checkAuditorConflicts(auditorIds, startDate, endDate);

    // 4. Create dalam transaksi
    return this.prisma.$transaction(async (tx) => {
      const st = await tx.trSuratTugas.create({
        data: {
          agendaAuditId: dto.agendaAuditId || null,
          nomorSt: dto.nomorSt,
          tanggalMulai: startDate,
          tanggalSelesai: endDate,
          statusSt: 'DRAF',
        },
      });

      // Daftarkan anggota tim
      const relationsData = auditors.map((auditor) => ({
        stId: st.id,
        auditorId: auditor.auditorId,
        peranDalamTim: auditor.peranDalamTim,
      }));

      await tx.relStAuditor.createMany({
        data: relationsData,
      });

      return tx.trSuratTugas.findUnique({
        where: { id: st.id },
        include: {
          stAuditors: {
            include: {
              auditor: true,
            },
          },
          agendaAudit: {
            include: {
              opd: true,
            },
          },
        },
      });
    });
  }

  /**
   * Menandatangani Surat Tugas secara elektronik (TTE) dan mengubah status ke AKTIF.
   */
  async signSt(id: string, dto: SignStDto) {
    const st = await this.prisma.trSuratTugas.findUnique({
      where: { id },
    });
    if (!st) {
      throw new NotFoundException('Surat Tugas tidak ditemukan.');
    }

    if (st.statusSt !== 'DRAF') {
      throw new ConflictException(
        'Hanya draf Surat Tugas yang dapat ditandatangani.',
      );
    }

    // Simulasi validasi passphrase certificate (misal: minimal 'tte-apip')
    if (dto.digitalCertificate.toLowerCase() === 'passphrase-salah') {
      throw new BadRequestException(
        'Sertifikat digital tidak valid atau passphrase salah.',
      );
    }

    return this.prisma.trSuratTugas.update({
      where: { id },
      data: {
        statusSt: 'AKTIF',
        signedAt: new Date(),
      },
      include: {
        stAuditors: {
          include: {
            auditor: true,
          },
        },
      },
    });
  }

  /**
   * Mengambil semua Surat Tugas.
   */
  async findAllSt() {
    return this.prisma.trSuratTugas.findMany({
      include: {
        stAuditors: {
          include: {
            auditor: true,
          },
        },
        agendaAudit: {
          include: {
            opd: true,
          },
        },
      },
      orderBy: { tanggalMulai: 'desc' },
    });
  }

  /**
   * Mengambil detail satu Surat Tugas.
   */
  async findOneSt(id: string) {
    const st = await this.prisma.trSuratTugas.findUnique({
      where: { id },
      include: {
        stAuditors: {
          include: {
            auditor: true,
          },
        },
        agendaAudit: {
          include: {
            opd: true,
          },
        },
        kkas: true,
        lhp: true,
      },
    });
    if (!st) {
      throw new NotFoundException('Surat Tugas tidak ditemukan.');
    }
    return st;
  }

  /**
   * Konflik checker jadwal auditor (Public).
   */
  async checkAuditorConflicts(
    auditorIds: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    const conflictingAssignment = await this.prisma.relStAuditor.findFirst({
      where: {
        auditorId: { in: auditorIds },
        suratTugas: {
          statusSt: 'AKTIF',
          tanggalMulai: { lte: endDate },
          tanggalSelesai: { gte: startDate },
        },
      },
      include: {
        auditor: true,
        suratTugas: true,
      },
    });

    if (conflictingAssignment) {
      const formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' });
      throw new ConflictException(
        `Auditor bernama "${conflictingAssignment.auditor.nama}" tidak dapat ditugaskan. ` +
          `Sebab yang bersangkutan aktif bertugas pada ST Nomor ${conflictingAssignment.suratTugas.nomorSt} ` +
          `rentang tanggal ${formatter.format(conflictingAssignment.suratTugas.tanggalMulai)} s.d ` +
          `${formatter.format(conflictingAssignment.suratTugas.tanggalSelesai)}.`,
      );
    }
  }

  /**
   * Mengambil daftar auditor yang tidak memiliki konflik jadwal (tidak sibuk di ST Aktif)
   */
  async getAvailableAuditors(startDate: Date, endDate: Date) {
    const busyAuditors = await this.prisma.relStAuditor.findMany({
      where: {
        suratTugas: {
          statusSt: 'AKTIF',
          tanggalMulai: { lte: endDate },
          tanggalSelesai: { gte: startDate },
        },
      },
      select: {
        auditorId: true,
      },
    });

    const busyIds = busyAuditors.map((r) => r.auditorId);

    return this.prisma.mstPegawai.findMany({
      where: busyIds.length > 0 ? { id: { notIn: busyIds } } : {},
      include: {
        opd: true,
      },
    });
  }

  /**
   * Menghapus draf Surat Tugas.
   */
  async deleteSt(id: string) {
    return this.prisma.trSuratTugas.delete({
      where: { id },
    });
  }
}
