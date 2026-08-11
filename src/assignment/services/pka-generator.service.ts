// src/assignment/services/pka-generator.service.ts
import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentRepository } from '../../document-ingestion/repositories/document.repository';
import { VendorLlmAdapter } from '../../common/ai/vendor-llm.adapter';
import { PkaDraftOutputSchema } from '../schemas/pka-draft-output.schema';
import { ExternalEmbeddingAdapter } from '../../document-ingestion/providers/external-embedding.adapter';

@Injectable()
export class PkaGeneratorService {
  private readonly logger = new Logger(PkaGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docRepository: DocumentRepository,
    private readonly llmAdapter: VendorLlmAdapter,
    private readonly embeddingAdapter: ExternalEmbeddingAdapter,
  ) {}

  /**
   * AI menyusun draf langkah kerja PKA berdasarkan regulasi dan rencana OPD target
   */
  async generatePka(stId: string, fokusPengawasan?: string) {
    this.logger.log(`Memulai orkestrasi AI PKA generator untuk Surat Tugas ID: ${stId}...`);

    // 1. Ambil Surat Tugas
    const st = await this.prisma.trSuratTugas.findUnique({
      where: { id: stId },
      include: {
        agendaAudit: {
          include: {
            opd: true,
          },
        },
      },
    });

    if (!st) {
      throw new NotFoundException('Surat Tugas tidak ditemukan.');
    }

    const opdName = st.agendaAudit?.opd?.namaOpd || 'Umum';

    // 2. Ambil konteks RAG
    // Pencarian regulasi acuan PKA & Contoh Template LHP di Global Vector Store
    const queryText = `contoh dokumen PKA SOP Program Kerja Audit langkah kerja pengujian ${fokusPengawasan || ''} template LHP NHP`;
    let queryVector: number[];
    try {
      queryVector = await this.embeddingAdapter.generateEmbedding(queryText);
    } catch (e) {
      queryVector = new Array(1536).fill(0);
    }

    const criteriaChunks = await this.docRepository.searchSimilarity(
      queryVector,
      3,
    );

    let criteriaText = '';
    if (criteriaChunks && criteriaChunks.length > 0) {
      criteriaText = criteriaChunks
        .map((c) => `[TEMPLATE & GUIDELINE REFERENSI] Sumber: ${c.document.title}\nKonten: ${c.content}`)
        .join('\n\n');
    } else {
      const fallbackChunks = await this.docRepository.searchKeyword('PKA', 3);
      criteriaText = fallbackChunks
        .map((c) => `[TEMPLATE & GUIDELINE REFERENSI] Sumber: ${c.document.title}\nKonten: ${c.content}`)
        .join('\n\n');
    }

    // 3. Susun Prompt Composite RAG
    const systemPrompt = `Anda adalah AI Asisten Auditor (Copilot) untuk Inspektorat.
Tugas Anda adalah menyusun Program Kerja Audit (PKA) yang berisi langkah-langkah kerja pengujian substantif dan kepatuhan.
Anda WAJIB meniru tingkat kedalaman teknis prosedur, gaya bahasa formal pengawasan, dan format penulisan dari TEMPLATE REFERENSI yang diberikan.
Anda WAJIB mengembalikan output dalam format JSON terstruktur yang mengikuti JSON Schema yang diberikan. Jangan mengarang data di luar konteks. Jangan menambahkan penjelasan teks Markdown di luar objek JSON.`;

    const userPrompt = `Surat Tugas Nomor: ${st.nomorSt}
OPD Sasaran: ${opdName}
Fokus Pengawasan: ${fokusPengawasan || 'Pengujian umum administratif dan kepatuhan'}
Periode Audit: ${st.tanggalMulai.toISOString()} s.d ${st.tanggalSelesai.toISOString()}

Berikut adalah Panduan Penyusunan & Contoh Dokumen PKA Referensi Masa Lalu (RAG):
${criteriaText}

Berdasarkan data kondisi aktual dan contoh template referensi masa lalu di atas, susunlah draf langkah kerja PKA (noLangkah, prosedur, pelaksanaRencana, waktuRencana dalam jam kerja HP) dengan tata bahasa pengawasan yang tajam dan formal.

JSON Schema Output yang WAJIB diikuti:
${JSON.stringify(PkaDraftOutputSchema)}

Berikan output JSON sekarang:`;

    // 4. Panggil LLM Lokal dalam JSON Mode
    this.logger.log('Mengirim permintaan draf PKA ke LLM lokal...');
    let rawResponse: string;
    try {
      rawResponse = await this.llmAdapter.callLlm(systemPrompt, userPrompt, {
        jsonMode: true,
        temperature: 0.2,
      });
    } catch (llmError) {
      this.logger.error(`Gagal menghubungi server LLM. Menjalankan fallback draf PKA: ${llmError.message}`);
      rawResponse = JSON.stringify(this.getFallbackPka(fokusPengawasan));
    }

    // 5. Parse dan simpan ke database secara transaksional
    try {
      const parsedData = JSON.parse(rawResponse);
      const steps = parsedData.steps || [];

      if (steps.length === 0) {
        throw new Error('LLM mengembalikan draf langkah kerja kosong.');
      }

      return await this.prisma.$transaction(async (tx) => {
        // Hapus draf langkah kerja PKA yang lama jika ada
        await tx.trPka.deleteMany({
          where: { stId },
        });

        const createdSteps = [];
        for (const step of steps) {
          const createdStep = await tx.trPka.create({
            data: {
              stId,
              noLangkah: step.noLangkah,
              prosedur: step.prosedur,
              pelaksanaRencana: step.pelaksanaRencana,
              waktuRencana: step.waktuRencana,
            },
          });
          createdSteps.push(createdStep);
        }

        this.logger.log(`Berhasil menyimpan ${createdSteps.length} langkah kerja PKA untuk ST Nomor: ${st.nomorSt}.`);
        return createdSteps;
      });
    } catch (parseError) {
      this.logger.error(`Gagal mem-parsing draf PKA: ${parseError.message}`);
      throw new InternalServerErrorException(`Gagal menyusun PKA: ${parseError.message}`);
    }
  }

  /**
   * Helper untuk mengembalikan draf PKA fallback jika server LLM lokal offline
   */
  private getFallbackPka(fokusPengawasan?: string) {
    return {
      steps: [
        {
          noLangkah: 'A.1',
          prosedur: `Lakukan reviu kesesuaian dokumen administrasi dengan fokus pengawasan: "${fokusPengawasan || 'Belanja Modal'}".`,
          pelaksanaRencana: 'Anggota_Tim',
          waktuRencana: 15,
        },
        {
          noLangkah: 'A.2',
          prosedur: 'Melakukan verifikasi fisik di lapangan atas realisasi belanja program.',
          pelaksanaRencana: 'Ketua_Tim',
          waktuRencana: 25,
        },
        {
          noLangkah: 'B.1',
          prosedur: 'Menyusun simpulan sementara hasil pengujian substantif untuk dimasukkan ke Kertas Kerja Audit (KKA).',
          pelaksanaRencana: 'Pengawas_Teknis',
          waktuRencana: 10,
        },
      ],
    };
  }
}
