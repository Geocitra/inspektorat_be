// src/klinik/klinik.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../common/ai/ai.service';
import { SanitizeService } from '../common/sanitize/sanitize.service';
import {
  CreateKategoriRegulasiDto,
  CreateRegulasiDto,
  CreateTiketKonsultasiDto,
  SubmitJawabanDto,
  ArchiveKmsDto,
} from './dto/klinik.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class KlinikService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly sanitizeService: SanitizeService,
    @InjectQueue('regulasi_embedding') private readonly embeddingQueue: Queue,
  ) {}

  onModuleInit() {
    // Membuat direktori penyimpanan lampiran klinik jika belum ada
    const uploadDir = path.join(process.cwd(), 'storage', 'klinik');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Membuat Kategori Regulasi Baru.
   */
  async createKategoriRegulasi(dto: CreateKategoriRegulasiDto) {
    const exists = await this.prisma.mstKategoriRegulasi.findUnique({
      where: { namaKategori: dto.namaKategori },
    });
    if (exists) {
      throw new ConflictException('Kategori regulasi sudah terdaftar.');
    }
    return this.prisma.mstKategoriRegulasi.create({
      data: { namaKategori: dto.namaKategori },
    });
  }

  /**
   * Membuat Regulasi Baru & Memicu BullMQ Embedding secara asinkron.
   */
  async createRegulasi(dto: CreateRegulasiDto) {
    const exists = await this.prisma.mstRegulasi.findUnique({
      where: { nomorRegulasi: dto.nomorRegulasi },
    });
    if (exists) {
      throw new ConflictException('Nomor regulasi sudah terdaftar.');
    }

    const reg = await this.prisma.mstRegulasi.create({
      data: {
        kategoriId: dto.kategoriId,
        nomorRegulasi: dto.nomorRegulasi,
        tentang: dto.tentang,
        kontenTeks: dto.kontenTeks,
        tahunTerbit: dto.tahunTerbit,
      },
    });

    // Masukkan ke antrean BullMQ untuk proses embeddings
    await this.embeddingQueue.add('generate', {
      regulasiId: reg.id,
    });

    return reg;
  }

  /**
   * Mengajukan Tiket Konsultasi Baru oleh OPD.
   * Secara otomatis memicu pencarian semantik (pgvector RAG) dan draf AI Copilot.
   */
  async createTiketKonsultasi(
    dto: CreateTiketKonsultasiDto,
    files: Express.Multer.File[],
  ) {
    // 1. Validasi OPD & Irban
    const opd = await this.prisma.mstOpd.findUnique({ where: { id: dto.opdId } });
    if (!opd) throw new NotFoundException('OPD tidak ditemukan.');

    const irban = await this.prisma.mstPegawai.findUnique({ where: { id: dto.irbanId } });
    if (!irban) throw new NotFoundException('Supervisor Irban tidak ditemukan.');

    // 2. Buat Nomor Tiket Unik
    const nomorTiket = `TK-${Date.now()}`;

    // 3. LOGIKA AI RAG: Ambil 3 Regulasi Terdekat dengan Pertanyaan OPD menggunakan Cosine Similarity pgvector
    let regulasisRujukan: any[] = [];
    let rancanganJawabanAI = '';

    try {
      const queryEmbedding = await this.aiService.generateEmbedding(dto.deskripsiKasus);
      const embeddingString = `[${queryEmbedding.join(',')}]`;

      // 1. Coba kueri Cosine Distance pgvector di database (sangat scalable)
      regulasisRujukan = await this.prisma.$queryRaw<any[]>`
        SELECT id, "nomor_regulasi" as "nomorRegulasi", "tentang", "konten_teks" as "kontenTeks"
        FROM mst_regulasi
        WHERE array_length(embedding, 1) IS NOT NULL
        ORDER BY embedding::vector <=> ${embeddingString}::vector
        LIMIT 3
      `;
    } catch (e) {
      // 2. Fallback ke in-memory Cosine Similarity jika pgvector extension tidak diaktifkan di database
      console.warn('[AI RAG WARNING] Gagal kalkulasi pgvector di database, menggunakan fallback in-memory:', e.message);
      try {
        const queryEmbedding = await this.aiService.generateEmbedding(dto.deskripsiKasus);
        const allRegulasis = await this.prisma.mstRegulasi.findMany();

        regulasisRujukan = allRegulasis
          .filter(r => r.embedding && r.embedding.length === 1536)
          .map(r => ({
            regulasi: r,
            score: this.cosineSimilarity(queryEmbedding, r.embedding),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(item => item.regulasi);
      } catch (innerErr) {
        console.error('[AI RAG ERROR] Gagal total kalkulasi kesamaan semantik:', innerErr.message);
      }
    }

    // 4. Susun Draf Jawaban AI Copilot berbasis Context Regulasi yang Didapatkan
    if (regulasisRujukan && regulasisRujukan.length > 0) {
      const contextText = regulasisRujukan
        .map((r, i) => `[RUJUKAN ${i + 1}] Nomor: ${r.nomorRegulasi}, Tentang: ${r.tentang}\nIsi Konten: ${r.kontenTeks}`)
        .join('\n\n');

      const systemPrompt = `Anda adalah Asisten AI hukum daerah (e-Audit/APIP Suite). Tugas Anda adalah menyusun rancangan jawaban resmi konsultasi bagi OPD berdasarkan rujukan regulasi yang diberikan. Jawaban harus tegas, terstruktur, berbasis rujukan hukum, dan objektif. Hindari halusinasi.`;
      const userPrompt = `Draf pertanyaan dari OPD:\n"${dto.deskripsiKasus}"\n\nRujukan Regulasi Terkait:\n${contextText}\n\nSajikan draf jawaban resmi Anda sekarang.`;

      rancanganJawabanAI = await this.aiService.generateChatCompletion(systemPrompt, userPrompt);
    } else {
      rancanganJawabanAI = '[DRAF AI] Tidak ditemukan rujukan regulasi terindeks di database untuk memformulasikan draf jawaban.';
    }

    // 5. Jalankan Transaksi Database
    return this.prisma.$transaction(async (tx) => {
      const tiket = await tx.trTiketKonsultasi.create({
        data: {
          opdId: dto.opdId,
          nomorTiket,
          judulPertanyaan: dto.judulPertanyaan,
          deskripsiKasus: dto.deskripsiKasus,
          irbanId: dto.irbanId,
          rancanganJawaban: rancanganJawabanAI,
          status: 'MENUNGGU_JAWABAN',
        },
      });

      // Simpan berkas lampiran
      if (files && files.length > 0) {
        for (const file of files) {
          const filename = `${Date.now()}-${file.originalname}`;
          const filePath = path.join(process.cwd(), 'storage', 'klinik', filename);
          fs.writeFileSync(filePath, file.buffer);

          await tx.trLampiranKonsultasi.create({
            data: {
              tiketId: tiket.id,
              filePath: `storage/klinik/${filename}`,
            },
          });
        }
      }

      // Hubungkan relasi regulasi rujukan terdekat hasil kueri pgvector
      if (regulasisRujukan && regulasisRujukan.length > 0) {
        for (const r of regulasisRujukan) {
          await tx.relTiketRegulasi.create({
            data: {
              tiketId: tiket.id,
              regulasiId: r.id,
            },
          });
        }
      }

      return tx.trTiketKonsultasi.findUnique({
        where: { id: tiket.id },
        include: {
          lampirans: true,
          tiketRegulasis: {
            include: {
              regulasi: true,
            },
          },
        },
      });
    });
  }

  /**
   * Auditor mengirimkan jawaban resmi konsultasi bagi OPD.
   */
  async submitJawaban(id: string, dto: SubmitJawabanDto) {
    const tiket = await this.prisma.trTiketKonsultasi.findUnique({
      where: { id },
    });
    if (!tiket) {
      throw new NotFoundException('Tiket konsultasi tidak ditemukan.');
    }

    if (tiket.status === 'TERJAWAB') {
      throw new ConflictException('Tiket konsultasi ini sudah dijawab sebelumnya.');
    }

    const auditor = await this.prisma.mstPegawai.findUnique({
      where: { id: dto.auditorJawabId },
    });
    if (!auditor) {
      throw new NotFoundException('Pegawai auditor penjawab tidak ditemukan.');
    }

    return this.prisma.trTiketKonsultasi.update({
      where: { id },
      data: {
        status: 'TERJAWAB',
        jawabanResmi: dto.jawabanResmi,
        auditorJawabId: dto.auditorJawabId,
      },
      include: {
        auditorJawab: true,
      },
    });
  }

  /**
   * Mengarsipkan Tiket Terjawab menjadi Artikel Studi Kasus KMS Umum (dengan Sanitasi Data UU PDP).
   */
  async archiveToKms(tiketId: string, dto: ArchiveKmsDto) {
    const tiket = await this.prisma.trTiketKonsultasi.findUnique({
      where: { id: tiketId },
      include: {
        kmsArtikel: true,
      },
    });

    if (!tiket) {
      throw new NotFoundException('Tiket konsultasi tidak ditemukan.');
    }

    if (tiket.status !== 'TERJAWAB' || !tiket.jawabanResmi) {
      throw new ConflictException(
        'Hanya tiket konsultasi terstatus TERJAWAB yang dapat diarsipkan ke KMS.',
      );
    }

    if (tiket.kmsArtikel) {
      throw new ConflictException('Tiket konsultasi ini sudah diarsipkan ke KMS.');
    }

    // Pembersihan data identitas sensitif menggunakan Regex Sanitizer (UU PDP Compliance)
    const sanitizedDescription = this.sanitizeService.sanitizeText(tiket.deskripsiKasus);

    return this.prisma.trKmsArtikel.create({
      data: {
        tiketId: tiketId,
        kategori: dto.kategori,
        judulStudiKasus: dto.judulStudiKasus,
        deskripsiKasusAnonim: sanitizedDescription,
        solusiHukum: tiket.jawabanResmi,
        referensiRegulasiId: dto.referensiRegulasiId || null,
      },
      include: {
        regulasi: true,
      },
    });
  }

  /**
   * Mendapatkan daftar semua regulasi.
   */
  async findAllRegulasi() {
    return this.prisma.mstRegulasi.findMany({
      include: {
        kategori: true,
      },
    });
  }

  /**
   * Mendapatkan daftar semua tiket konsultasi.
   */
  async findAllTiket() {
    return this.prisma.trTiketKonsultasi.findMany({
      include: {
        opd: true,
        irbanSupervisor: true,
        auditorJawab: true,
        lampirans: true,
      },
    });
  }

  /**
   * Mendapatkan daftar artikel KMS.
   */
  async findAllKms() {
    return this.prisma.trKmsArtikel.findMany({
      include: {
        regulasi: true,
      },
    });
  }
}
