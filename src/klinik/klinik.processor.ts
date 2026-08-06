// src/klinik/klinik.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../common/ai/ai.service';

@Processor('regulasi_embedding')
export class KlinikProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { regulasiId } = job.data;
    console.log(
      `[QUEUED JOB] Memulai kalkulasi vector embedding untuk Regulasi ID: ${regulasiId}`,
    );

    // 1. Ambil data regulasi dari database
    const regulasi = await this.prisma.mstRegulasi.findUnique({
      where: { id: regulasiId },
    });

    if (!regulasi) {
      console.log(`[QUEUED JOB] Regulasi dengan ID ${regulasiId} tidak ditemukan.`);
      return;
    }

    // 2. Gabungkan konten regulasi sebagai input teks bagi model embeddings
    const textToEmbed = `Nomor: ${regulasi.nomorRegulasi} Tentang: ${regulasi.tentang} Konten: ${regulasi.kontenTeks}`.trim();

    // 3. Panggil AiService untuk mendapatkan koordinat vektor 1536-dimensi
    const embedding = await this.aiService.generateEmbedding(textToEmbed);

    // 4. Update database menggunakan Prisma Client API standar untuk tipe Float[]
    await this.prisma.mstRegulasi.update({
      where: { id: regulasiId },
      data: {
        embedding: embedding,
      },
    });

    console.log(
      `[QUEUED JOB] Embedding selesai & disimpan untuk Regulasi: ${regulasi.nomorRegulasi}`,
    );

    return { success: true, regulasiId };
  }
}
