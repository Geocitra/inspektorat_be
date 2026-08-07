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
   */
  async recommendTeam(startDate: Date, endDate: Date, fokusAudit: string) {
    this.logger.log(`Mencari rekomendasi tim auditor bebas konflik untuk rentang ${startDate.toISOString()} s.d ${endDate.toISOString()}...`);

    // 1. Ambil semua auditor bebas tugas
    const availableAuditors = await this.assignmentService.getAvailableAuditors(startDate, endDate);
    if (availableAuditors.length < 3) {
      throw new BadRequestException(
        `Jumlah auditor yang tersedia (${availableAuditors.length}) kurang dari batas minimum tim (3 orang).`
      );
    }

    // 2. Beri skor kecocokan kompetensi/keahlian secara deterministik (Audit Skill Matcher)
    const scoredAuditors = availableAuditors.map((auditor) => {
      let score = 0.5; // base score
      const focusLower = fokusAudit.toLowerCase();
      const namaLower = auditor.nama.toLowerCase();
      const jabLower = (auditor.jabatan || '').toLowerCase();

      // Heuristik pencocokan kompetensi sederhana
      if (focusLower.includes('keuangan') || focusLower.includes('anggaran')) {
        if (jabLower.includes('akuntan') || jabLower.includes('keuangan') || jabLower.includes('auditor')) {
          score += 0.3;
        }
      }
      if (focusLower.includes('fisik') || focusLower.includes('konstruksi') || focusLower.includes('pbj')) {
        if (jabLower.includes('teknik') || jabLower.includes('sipil') || jabLower.includes('ppupd')) {
          score += 0.3;
        }
      }
      if (focusLower.includes('kinerja') || focusLower.includes('evaluasi')) {
        if (jabLower.includes('ahli madya') || jabLower.includes('muda')) {
          score += 0.2;
        }
      }

      // Stabilitas sorting menggunakan hash nilai string agar konsisten dalam verifikasi E2E
      const hashValue = (auditor.nama.charCodeAt(0) + (auditor.jabatan || '').charCodeAt(0)) % 100;
      score += hashValue / 1000; // menambahkan bias desimal kecil 0.00 s.d 0.09

      return {
        ...auditor,
        score: Math.min(1.0, score),
      };
    });

    // Urutkan auditor berdasarkan skor tertinggi
    scoredAuditors.sort((a, b) => b.score - a.score);

    // 3. Petakan Peran Tim (PJ, KT, AT)
    // - PJ (Pengawas Teknis): Peringkat 1
    // - KT (Ketua Tim): Peringkat 2
    // - AT (Anggota Tim): Sisa auditor peringkat 3 ke bawah
    const pj = scoredAuditors[0];
    const kt = scoredAuditors[1];
    const ats = scoredAuditors.slice(2);

    const team = [
      {
        auditorId: pj.id,
        nama: pj.nama,
        jabatan: pj.jabatan,
        peranDalamTim: 'Pengawas_Teknis',
        score: pj.score,
      },
      {
        auditorId: kt.id,
        nama: kt.nama,
        jabatan: kt.jabatan,
        peranDalamTim: 'Ketua_Tim',
        score: kt.score,
      },
      ...ats.map((at) => ({
        auditorId: at.id,
        nama: at.nama,
        jabatan: at.jabatan,
        peranDalamTim: 'Anggota_Tim',
        score: at.score,
      })),
    ];

    this.logger.log(`Berhasil merekomendasikan tim berisi ${team.length} auditor.`);
    return {
      fokusAudit,
      periodePenugasan: {
        mulai: startDate,
        selesai: endDate,
      },
      totalTersedia: availableAuditors.length,
      recommendation: team,
    };
  }
}
