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
   * Merekomendasikan susunan tim auditor yang optimal (PJ, KT, AT) bebas dari konflik jadwal
   * Mengintegrasikan unit pelaksana (Irban) dari agenda PKPT resmi.
   */
  async recommendTeam(
    startDate: Date, 
    endDate: Date, 
    fokusAudit: string,
    agendaAuditId?: string | null,
    pelaksanaOverride?: string | null,
  ) {
    this.logger.log(`Mencari rekomendasi tim auditor bebas konflik untuk rentang ${startDate.toISOString()} s.d ${endDate.toISOString()}...`);

    // 1. Dapatkan konteks agenda PKPT jika dihubungkan
    let targetPelaksana = pelaksanaOverride || '';
    let areaPengawasan = '';
    let alokasiHp = null;

    if (agendaAuditId) {
      const agenda = await this.prisma.trAgendaAudit.findUnique({
        where: { id: agendaAuditId },
        include: { opd: true, pkpt: true },
      });
      if (agenda) {
        const sub = (agenda.substansiDokumen as any) || {};
        targetPelaksana = targetPelaksana || sub.pelaksana || '';
        areaPengawasan = sub.areaPengawasan || agenda.jenisPengawasan || '';
        alokasiHp = sub.hariPemeriksaan || null;
      }
    }

    // 2. Ambil semua auditor bebas tugas (tidak sedang aktif di ST lain)
    const availableAuditors = await this.assignmentService.getAvailableAuditors(startDate, endDate);
    if (availableAuditors.length < 3) {
      throw new BadRequestException(
        `Jumlah auditor yang tersedia (${availableAuditors.length}) kurang dari batas minimum tim (3 orang).`
      );
    }

    // 3. Beri skor kecocokan kompetensi & unit pelaksana Irban (Smart Staffing Matcher)
    const scoredAuditors = availableAuditors.map((auditor) => {
      let score = 0.5; // base score
      const focusLower = `${fokusAudit} ${areaPengawasan}`.toLowerCase();
      const namaLower = auditor.nama.toLowerCase();
      const jabLower = (auditor.jabatan || '').toLowerCase();
      const pelaksanaLower = targetPelaksana.toLowerCase();

      // Bobot Unit Irban: jika auditor bertugas di Irban yang sama
      if (pelaksanaLower && jabLower.includes(pelaksanaLower)) {
        score += 0.25;
      }

      // Heuristik pencocokan kompetensi bidang
      if (focusLower.includes('keuangan') || focusLower.includes('anggaran') || focusLower.includes('bos')) {
        if (jabLower.includes('akuntan') || jabLower.includes('keuangan') || jabLower.includes('auditor')) {
          score += 0.2;
        }
      }
      if (focusLower.includes('fisik') || focusLower.includes('konstruksi') || focusLower.includes('pbj') || focusLower.includes('jalan')) {
        if (jabLower.includes('teknik') || jabLower.includes('sipil') || jabLower.includes('ppupd')) {
          score += 0.2;
        }
      }
      if (focusLower.includes('kinerja') || focusLower.includes('evaluasi') || focusLower.includes('probity')) {
        if (jabLower.includes('ahli madya') || jabLower.includes('muda') || jabLower.includes('investigasi')) {
          score += 0.15;
        }
      }

      // Stabilitas sorting menggunakan hash deterministik
      const hashValue = (auditor.nama.charCodeAt(0) + (auditor.jabatan || '').charCodeAt(0)) % 100;
      score += hashValue / 1000;

      return {
        ...auditor,
        score: Math.min(1.0, score),
      };
    });

    // Urutkan auditor berdasarkan skor tertinggi
    scoredAuditors.sort((a, b) => b.score - a.score);

    // 4. Petakan Peran Tim (PJ/Dalnis, KT, AT)
    const pj = scoredAuditors[0];
    const kt = scoredAuditors[1];
    const ats = scoredAuditors.slice(2);

    const team = [
      {
        auditorId: pj.id,
        nama: pj.nama,
        jabatan: pj.jabatan,
        peranDalamTim: 'Pengawas_Teknis',
        score: Number(pj.score.toFixed(2)),
      },
      {
        auditorId: kt.id,
        nama: kt.nama,
        jabatan: kt.jabatan,
        peranDalamTim: 'Ketua_Tim',
        score: Number(kt.score.toFixed(2)),
      },
      ...ats.map((at) => ({
        auditorId: at.id,
        nama: at.nama,
        jabatan: at.jabatan,
        peranDalamTim: 'Anggota_Tim',
        score: Number(at.score.toFixed(2)),
      })),
    ];

    this.logger.log(`Berhasil merekomendasikan tim (${targetPelaksana || 'APIP Umum'}) berisi ${team.length} auditor.`);
    return {
      fokusAudit,
      unitPelaksana: targetPelaksana || 'Tim Gabungan APIP',
      alokasiHariPemeriksaan: alokasiHp,
      periodePenugasan: {
        mulai: startDate,
        selesai: endDate,
      },
      totalTersedia: availableAuditors.length,
      recommendation: team,
    };
  }
}
