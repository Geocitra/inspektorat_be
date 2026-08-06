// src/tlhp/tlhp.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Processor('compliance_calculation')
export class TlhpProcessor extends WorkerHost {
  private redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super();
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host', '127.0.0.1'),
      port: this.configService.get<number>('redis.port', 6379),
    });
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { opdId } = job.data;
    console.log(
      `[QUEUED JOB] Memulai rekalkulasi skor kepatuhan untuk OPD ID: ${opdId}`,
    );

    // 1. Hitung total rekomendasi untuk OPD bersangkutan
    const totalRekomendasi = await this.prisma.trRekomendasi.count({
      where: {
        temuan: {
          opdId: opdId,
        },
      },
    });

    // 2. Hitung total rekomendasi berstatus SESUAI
    const rekomendasiSelesai = await this.prisma.trRekomendasi.count({
      where: {
        temuan: {
          opdId: opdId,
        },
        statusRekomendasi: 'SESUAI',
      },
    });

    // 3. Kalkulasi Skor Kepatuhan (0 s.d 100)
    const skorKepatuhan =
      totalRekomendasi > 0 ? (rekomendasiSelesai / totalRekomendasi) * 100 : 100.0;

    const formattedScore = skorKepatuhan.toFixed(2);

    // 4. Simpan ke Redis cache agar bisa dikonsumsi cepat oleh Dashboard Bupati/Kepala Daerah
    const cacheKey = `compliance_score:opd:${opdId}`;
    await this.redis.set(cacheKey, formattedScore);

    console.log(
      `[QUEUED JOB] Rekalkulasi Selesai. OPD ID: ${opdId}, Total: ${totalRekomendasi}, Sesuai: ${rekomendasiSelesai}, Skor: ${formattedScore}%`,
    );

    return { success: true, opdId, score: formattedScore };
  }
}
