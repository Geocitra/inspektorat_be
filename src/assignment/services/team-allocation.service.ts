// src/assignment/services/team-allocation.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignmentService } from '../assignment.service';

@Injectable()
export class TeamAllocationService {
  private readonly logger = new Logger(TeamAllocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentService: AssignmentService,
  ) {}

  /**
   * Merekomendasikan susunan tim auditor yang optimal (PJ/Dalnis, KT, AT)
   * menggunakan algoritma AI Smart Load-Balancing & Workload Capacity.
   */
  async recommendTeam(
    startDate: Date, 
    endDate: Date, 
    fokusAudit: string,
    agendaAuditId?: string | null,
    pelaksanaOverride?: string | null,
  ) {
    this.logger.log(`Menghitung alokasi tim berbasis Smart Load-Balancing...`);

    // 1. Dapatkan konteks agenda PKPT jika dihubungkan
    let targetPelaksana = pelaksanaOverride || '';
    let areaPengawasan = '';

    if (agendaAuditId) {
      const agenda = await this.prisma.trAgendaAudit.findUnique({
        where: { id: agendaAuditId },
        include: { opd: true, pkpt: true },
      });
      if (agenda) {
        const sub = (agenda.substansiDokumen as any) || {};
        targetPelaksana = targetPelaksana || sub.pelaksana || '';
        areaPengawasan = sub.areaPengawasan || agenda.jenisPengawasan || '';
      }
    }

    // 2. Ambil seluruh personil fungsional beserta beban kerja aktifnya
    const auditorsWithWorkload = await this.assignmentService.getAuditorsWithWorkload();
    if (auditorsWithWorkload.length === 0) {
      throw new BadRequestException('Tidak ada data auditor lapangan yang terdaftar di sistem.');
    }

    // Filter yang belum mencapai batas kapasitas maksimal (AT/KT max 3 ST)
    const eligibleAuditors = auditorsWithWorkload.filter((a) => a.activeStCount < 3);
    const pool = eligibleAuditors.length >= 2 ? eligibleAuditors : auditorsWithWorkload;

    // 3. Hitung Scoring Beban Kerja + Kesesuaian Unit Kerja Irban + Kompetensi
    const scoredAuditors = pool.map((auditor) => {
      let score = 0.5;

      // Faktor 1: Load-Balancing (Beban aktif paling sedikit diberi skor tertinggi)
      if (auditor.activeStCount === 0) {
        score += 0.35; // Sangat diprioritaskan
      } else if (auditor.activeStCount === 1) {
        score += 0.15;
      } else {
        score -= 0.15; // Kurang diprioritaskan jika sudah ada 2 ST
      }

      // Faktor 2: Kesesuaian Unit Kerja Irban
      const pelaksanaUpper = targetPelaksana.toUpperCase();
      const unitKerjaUpper = (auditor.unitKerja || '').toUpperCase();

      if (pelaksanaUpper.includes('IRBAN 1') && unitKerjaUpper === 'IRBAN_1') score += 0.25;
      else if (pelaksanaUpper.includes('IRBAN 2') && unitKerjaUpper === 'IRBAN_2') score += 0.25;
      else if (pelaksanaUpper.includes('IRBAN 3') && unitKerjaUpper === 'IRBAN_3') score += 0.25;
      else if (pelaksanaUpper.includes('INVESTIGASI') && unitKerjaUpper === 'IRBAN_INVESTIGASI') score += 0.25;

      // Faktor 3: Heuristik Fokus Audit
      const focusCombined = `${fokusAudit} ${areaPengawasan}`.toLowerCase();
      const jabLower = (auditor.jabatan || '').toLowerCase();

      if (focusCombined.includes('keuangan') || focusCombined.includes('anggaran') || focusCombined.includes('bos')) {
        if (jabLower.includes('akuntan') || jabLower.includes('keuangan') || jabLower.includes('auditor')) {
          score += 0.15;
        }
      }
      if (focusCombined.includes('fisik') || focusCombined.includes('konstruksi') || focusCombined.includes('pbj') || focusCombined.includes('jalan')) {
        if (jabLower.includes('teknik') || jabLower.includes('sipil') || jabLower.includes('ppupd')) {
          score += 0.15;
        }
      }

      return {
        ...auditor,
        score: Math.min(1.0, Math.max(0.1, score)),
      };
    });

    // Urutkan berdasarkan skor tertinggi
    scoredAuditors.sort((a, b) => b.score - a.score);

    // 4. Petakan Rekomendasi Peran Tim
    // PJ / Dalnis = Ranking 1
    // Ketua Tim (KT) = Ranking 2 (atau jika cuma 1 orang, jadi KT)
    // Anggota Tim (AT) = Ranking 3 dst.
    const pj = scoredAuditors[0];
    const kt = scoredAuditors.length > 1 ? scoredAuditors[1] : pj;
    const ats = scoredAuditors.length > 2 ? scoredAuditors.slice(2, 4) : [kt];

    return {
      pengawasTeknis: {
        id: pj.id,
        nama: pj.nama,
        nip: pj.nip,
        jabatan: pj.jabatan,
        unitKerja: pj.unitKerja,
        activeStCount: pj.activeStCount,
        workloadLevel: pj.workloadLevel,
        score: pj.score,
      },
      ketuaTim: {
        id: kt.id,
        nama: kt.nama,
        nip: kt.nip,
        jabatan: kt.jabatan,
        unitKerja: kt.unitKerja,
        activeStCount: kt.activeStCount,
        workloadLevel: kt.workloadLevel,
        score: kt.score,
      },
      anggotaTim: ats.map((at) => ({
        id: at.id,
        nama: at.nama,
        nip: at.nip,
        jabatan: at.jabatan,
        unitKerja: at.unitKerja,
        activeStCount: at.activeStCount,
        workloadLevel: at.workloadLevel,
        score: at.score,
      })),
      fokusAudit,
      targetPelaksana,
      allAvailableAuditors: scoredAuditors,
    };
  }
}
