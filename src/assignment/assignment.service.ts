// src/assignment/assignment.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStDto, SignStDto } from './dto/st.dto';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Membuat draf Surat Tugas baru.
   * Mendukung penugasan mandiri (1 personil) maupun tim lengkap (PT, KT, AT).
   */
  async createSt(dto: CreateStDto) {
    const startDate = new Date(dto.tanggalMulai);
    const endDate = new Date(dto.tanggalSelesai);

    // 1. Validasi relasi Agenda PKPT jika ada
    if (dto.agendaAuditId) {
      const agenda = await this.prisma.trAgendaAudit.findUnique({
        where: { id: dto.agendaAuditId },
        include: { pkpt: true },
      });

      if (!agenda) {
        throw new NotFoundException('Agenda audit PKPT tidak ditemukan.');
      }

      if (agenda.pkpt.statusPkpt !== 'DISETUJUI') {
        throw new BadRequestException(
          `Surat Tugas hanya dapat diterbitkan untuk PKPT yang berstatus DISETUJUI. Status saat ini: ${agenda.pkpt.statusPkpt}`,
        );
      }

      // Mencegah duplikasi Surat Tugas untuk agenda yang sama
      const existingSt = await this.prisma.trSuratTugas.findFirst({
        where: { agendaAuditId: dto.agendaAuditId },
      });
      if (existingSt) {
        throw new ConflictException(
          `Surat Tugas untuk agenda audit ini sudah pernah diterbitkan (ST ID: ${existingSt.id}).`,
        );
      }
    }

    // 2. Validasi Personil Penugasan (Minimal 1 personil)
    const auditors = dto.auditors;
    if (!auditors || auditors.length === 0) {
      throw new BadRequestException('Surat Tugas harus memiliki minimal 1 personil.');
    }

    // 3. Validasi Kapasitas Beban Kerja (Workload Capacity Validator)
    await this.validateAuditorWorkloads(
      auditors.map((a) => ({
        auditorId: a.auditorId as string,
        peranDalamTim: a.peranDalamTim as string,
      })),
    );

    // 4. Buat Surat Tugas & Relasi Auditor dalam transaksi
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
        agendaAudit: {
          include: {
            opd: true,
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
   * Validasi Kapasitas Beban Kerja (Concurrent Multi-Assignment Quota)
   * Batas kuota wajar:
   * - Pengawas Teknis / Dalnis: max 5 ST Aktif
   * - Ketua Tim: max 3 ST Aktif
   * - Anggota Tim: max 3 ST Aktif
   */
  async validateAuditorWorkloads(
    auditors: Array<{ auditorId: string; peranDalamTim: string }>,
  ): Promise<void> {
    for (const item of auditors) {
      const activeAssignments = await this.prisma.relStAuditor.findMany({
        where: {
          auditorId: item.auditorId,
          suratTugas: { statusSt: 'AKTIF' },
        },
        include: { auditor: true },
      });

      const maxLimit = item.peranDalamTim === 'Pengawas_Teknis' ? 5 : 3;
      if (activeAssignments.length >= maxLimit) {
        const auditorName = activeAssignments[0]?.auditor?.nama || 'Auditor';
        throw new ConflictException(
          `Kapasitas beban kerja terlampaui: "${auditorName}" telah memegang ${activeAssignments.length} Surat Tugas aktif (Batas maksimal ${maxLimit} ST). Silakan pilih personil lain.`,
        );
      }
    }
  }

  /**
   * Mengambil daftar seluruh auditor fungsional lengkap dengan profil beban kerja terkini
   * (Digunakan oleh Form Frontend untuk menampilkan badge 🟢, 🟡, 🔴)
   */
  async getAuditorsWithWorkload() {
    const pegawaiList = await this.prisma.mstPegawai.findMany({
      where: {
        isAuditorLapangan: true,
      },
      include: {
        opd: true,
        stAuditors: {
          where: {
            suratTugas: { statusSt: 'AKTIF' },
          },
          include: {
            suratTugas: {
              include: {
                agendaAudit: {
                  include: { opd: true },
                },
              },
            },
          },
        },
      },
      orderBy: { nama: 'asc' },
    });

    return pegawaiList.map((p) => {
      const activeStCount = p.stAuditors.length;
      const activeStDetails = p.stAuditors.map((sa) => ({
        nomorSt: sa.suratTugas.nomorSt,
        peran: sa.peranDalamTim,
        namaOpd: sa.suratTugas.agendaAudit?.opd?.namaOpd || 'Audit Umum',
      }));

      let workloadLevel: 'LONGGAR' | 'SEDANG' | 'PENUH' = 'LONGGAR';
      if (activeStCount >= 3) {
        workloadLevel = 'PENUH';
      } else if (activeStCount >= 1) {
        workloadLevel = 'SEDANG';
      }

      return {
        id: p.id,
        nip: p.nip,
        nama: p.nama,
        golongan: p.golongan,
        jabatan: p.jabatan,
        unitKerja: p.unitKerja || 'IRBAN_1',
        activeStCount,
        workloadLevel,
        activeStDetails,
      };
    });
  }

  /**
   * Helper untuk meng-generate Nomor ST otomatis dan rentang tanggal kerja
   */
  async generateStMeta(agendaAuditId?: string) {
    const currentYear = new Date().getFullYear();
    const countThisYear = await this.prisma.trSuratTugas.count({
      where: {
        tanggalMulai: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
    });

    const nextSeq = String(countThisYear + 1).padStart(3, '0');
    let unitCode = 'IRB.I';
    let durationHp = 15; // default 15 hari kerja

    if (agendaAuditId) {
      const agenda = await this.prisma.trAgendaAudit.findUnique({
        where: { id: agendaAuditId },
      });
      if (agenda) {
        const sub = (agenda.substansiDokumen as any) || {};
        const pelaksana = (sub.pelaksana || '').toUpperCase();
        if (pelaksana.includes('IRBAN 2') || pelaksana.includes('IRBAN II')) unitCode = 'IRB.II';
        else if (pelaksana.includes('IRBAN 3') || pelaksana.includes('IRBAN III')) unitCode = 'IRB.III';
        else if (pelaksana.includes('INVESTIGASI')) unitCode = 'IRB.INV';
        else if (pelaksana.includes('GABUNGAN') || pelaksana.includes('PPUPD')) unitCode = 'TIM.GAB';

        if (sub.hariPemeriksaan?.totalHp) {
          durationHp = Math.min(60, Number(sub.hariPemeriksaan.totalHp) || 15);
        }
      }
    }

    const nomorSt = `ST.700.1.2/${nextSeq}/ITDA-${unitCode}/${currentYear}`;

    // Hitung tanggal mulai (Senin terdekat) dan tanggal selesai (menambah hari kerja)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 2); // Mulai 2 hari ke depan
    if (startDate.getDay() === 0) startDate.setDate(startDate.getDate() + 1); // Jika minggu -> senin
    if (startDate.getDay() === 6) startDate.setDate(startDate.getDate() + 2); // Jika sabtu -> senin

    const endDate = new Date(startDate);
    // Tambah hari kalender kasar sesuai estimasi HP
    endDate.setDate(endDate.getDate() + Math.ceil(durationHp * 1.4));

    return {
      suggestedNomorSt: nomorSt,
      suggestedStartDate: startDate.toISOString().split('T')[0],
      suggestedEndDate: endDate.toISOString().split('T')[0],
      estimatedHp: durationHp,
    };
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
