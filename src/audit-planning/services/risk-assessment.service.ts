// src/audit-planning/services/risk-assessment.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateHaversineDistance, parseCoordinates } from '../../common/utils/geo.util';

@Injectable()
export class RiskAssessmentService {
  private readonly logger = new Logger(RiskAssessmentService.name);
  
  // Koordinat referensi pusat kota / Kantor Inspektorat
  private readonly centerLatitude = -7.250445;
  private readonly centerLongitude = 112.768845;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Menghitung nilai risiko (NRI, NFR, NTR) secara deterministik untuk seluruh OPD di tahun anggaran tertentu
   */
  async calculateRisk(tahun: number) {
    this.logger.log(`Memulai kalkulasi penilaian risiko OPD untuk tahun anggaran ${tahun}...`);

    const opds = await this.prisma.mstOpd.findMany();
    if (opds.length === 0) {
      throw new NotFoundException('Tidak ada data OPD di database.');
    }

    const assessments = [];

    for (const opd of opds) {
      // 1. Kalkulasi NRI (Nilai Risiko Inheren)
      // A. Pagu Anggaran (Budget Factor)
      const sumBudgetResult = await this.prisma.trAgendaAudit.aggregate({
        _sum: { estimasiAnggaran: true },
        where: { opdId: opd.id },
      });
      const sumBudget = Number(sumBudgetResult._sum.estimasiAnggaran || 0);
      let budgetScore = 1;
      
      if (sumBudget > 5000000000) {
        budgetScore = 5; // > 5 Milyar
      } else if (sumBudget > 1000000000) {
        budgetScore = 3; // 1M - 5M
      } else if (sumBudget > 0) {
        budgetScore = 1; // < 1M
      } else {
        // Fallback deterministik jika pagu belum pernah diinput (menggunakan hash nama OPD)
        budgetScore = (opd.namaOpd.charCodeAt(0) % 3) * 2 + 1; // memberikan nilai 1, 3, atau 5
      }

      // B. Jarak Logistik (Distance Factor)
      const opdCoord = parseCoordinates(opd.gpsKoordinat);
      let distanceScore = 1;
      if (opdCoord) {
        const distance = calculateHaversineDistance(
          this.centerLatitude,
          this.centerLongitude,
          opdCoord.latitude,
          opdCoord.longitude,
        );
        if (distance > 10000) {
          distanceScore = 5; // > 10 km
        } else if (distance > 5000) {
          distanceScore = 3; // 5 - 10 km
        } else {
          distanceScore = 1; // < 5 km
        }
      }

      const nri = (budgetScore + distanceScore) / 2;

      // 2. Kalkulasi NFR (Nilai Faktor Risiko)
      // A. Historis Temuan (Findings Factor)
      const findingsCount = await this.prisma.trTemuan.count({
        where: { opdId: opd.id },
      });
      let findingsScore = 1;
      if (findingsCount > 5) {
        findingsScore = 5;
      } else if (findingsCount >= 1) {
        findingsScore = 3;
      }

      // B. Rekomendasi Terbuka (Unresolved Factor)
      const unresolvedCount = await this.prisma.trRekomendasi.count({
        where: {
          temuan: { opdId: opd.id },
          statusRekomendasi: { not: 'SESUAI' },
        },
      });
      let unresolvedScore = 1;
      if (unresolvedCount > 2) {
        unresolvedScore = 5;
      } else if (unresolvedCount >= 1) {
        unresolvedScore = 3;
      }

      const nfr = (findingsScore + unresolvedScore) / 2;

      // 3. Kalkulasi NTR (Nilai Total Risiko)
      const ntr = nri * 0.70 + nfr * 0.30;

      // 4. Simpan/Upsert hasil ke database
      const assessment = await this.prisma.opdRiskAssessment.upsert({
        where: {
          opdId_tahun: {
            opdId: opd.id,
            tahun,
          },
        },
        update: {
          nri,
          nfr,
          ntr,
        },
        create: {
          opdId: opd.id,
          tahun,
          nri,
          nfr,
          ntr,
        },
        include: {
          opd: true,
        },
      });

      assessments.push(assessment);
    }

    // Urutkan assessments berdasarkan NTR tertinggi
    return assessments.sort((a, b) => Number(b.ntr) - Number(a.ntr));
  }

  /**
   * Mengambil ranking risiko OPD hasil kalkulasi
   */
  async getRiskRanking(tahun: number) {
    const rankings = await this.prisma.opdRiskAssessment.findMany({
      where: { tahun },
      include: { opd: true },
      orderBy: { ntr: 'desc' },
    });
    return rankings;
  }
}
