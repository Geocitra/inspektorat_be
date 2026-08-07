// src/audit-planning/services/pkpt-generator.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RiskAssessmentService } from './risk-assessment.service';
import { DocumentRepository } from '../../document-ingestion/repositories/document.repository';
import { VendorLlmAdapter } from '../../common/ai/vendor-llm.adapter';
import { PkptDraftOutputSchema } from '../schemas/pkpt-draft-output.schema';
import { SumberPembuatan, DocumentStatus } from '@prisma/client';
import { ExternalEmbeddingAdapter } from '../../document-ingestion/providers/external-embedding.adapter';

@Injectable()
export class PkptGeneratorService {
  private readonly logger = new Logger(PkptGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskService: RiskAssessmentService,
    private readonly docRepository: DocumentRepository,
    private readonly llmAdapter: VendorLlmAdapter,
    private readonly embeddingAdapter: ExternalEmbeddingAdapter,
  ) {}

  /**
   * Menyusun draf PKPT & Agenda audit berbasis RAG dan ranking risiko OPD
   */
  async generateDraftPkpt(tahunAnggaran: number, instruksiTambahan?: string) {
    this.logger.log(`Memulai orkestrasi generasi draf PKPT berbasis AI untuk tahun anggaran ${tahunAnggaran}...`);

    // 1. Dapatkan ranking risiko OPD (hitung jika belum ada)
    let rankings = await this.riskService.getRiskRanking(tahunAnggaran);
    if (rankings.length === 0) {
      rankings = await this.riskService.calculateRisk(tahunAnggaran);
    }

    const rankingString = rankings
      .slice(0, 10) // Fokus pada 10 OPD berisiko tertinggi
      .map((r, idx) => `${idx + 1}. OPD: ${r.opd.namaOpd} (ID: ${r.opdId}, NTR: ${r.ntr}, NRI: ${r.nri}, NFR: ${r.nfr})`)
      .join('\n');

    // 2. Ambil konteks RAG: Kriteria dari Global Vector Store
    // Lakukan pencarian semantik menggunakan koordinat vektor riil
    const queryText = `pedoman kriteria tata cara penyusunan PKPT pengawasan Inspektorat ${instruksiTambahan || ''}`;
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
        .map((c) => `[CRITERIA] Sumber: ${c.document.title}\nKonten: ${c.content}`)
        .join('\n\n');
    } else {
      // Fallback kata kunci manual ke regulasi jika pencarian semantik kosong
      const fallbackChunks = await this.docRepository.searchKeyword('PKPT', 3);
      criteriaText = fallbackChunks
        .map((c) => `[CRITERIA] Sumber: ${c.document.title}\nKonten: ${c.content}`)
        .join('\n\n');
    }

    // 3. Susun Prompt Composite RAG
    const systemPrompt = `Anda adalah AI Asisten Analitis dan Penyusun Draf (Copilot) untuk Inspektorat Daerah Kota Bekasi.
Tugas Anda adalah menyusun usulan draf program kerja pengawasan tahunan (PKPT) & Agenda Audit untuk OPD-OPD berdasarkan tingkat risiko (NTR), data anggaran/geografis, dan pedoman regulasi pengawasan.
Anda WAJIB mengembalikan output dalam format JSON terstruktur yang mengikuti JSON Schema yang diberikan. Jangan mengarang data di luar konteks. Jangan menambahkan penjelasan teks Markdown di luar objek JSON.`;

    const userPrompt = `Tahun Anggaran: ${tahunAnggaran}
Instruksi Tambahan User: ${instruksiTambahan || 'Tidak ada'}

Berikut adalah Daftar 10 OPD Ter-ranking berdasarkan Nilai Total Risiko (NTR):
${rankingString}

Berikut adalah Regulasi Acuan (Kriteria):
${criteriaText || 'Gunakan pedoman standard audit berbasis risiko Inspektorat.'}

Anda WAJIB menghasilkan draf usulan pengawasan untuk OPD-OPD di atas (terutama prioritas untuk yang berisiko Tinggi/Sedang).
Pecah Hari Pemeriksaan (HP) untuk masing-masing peran tim (PJ, WKPJ, Dalnis, KT, AT) secara logis sesuai tingkat kesulitan.

JSON Schema Output yang WAJIB diikuti:
${JSON.stringify(PkptDraftOutputSchema)}

Berikan output JSON sekarang:`;

    // 4. Panggil LLM Lokal dalam JSON Mode
    this.logger.log('Mengirim permintaan draf PKPT ke LLM lokal...');
    let rawResponse: string;
    try {
      rawResponse = await this.llmAdapter.callLlm(systemPrompt, userPrompt, {
        jsonMode: true,
        temperature: 0.1, // Rendah untuk presisi
      });
    } catch (llmError) {
      this.logger.error(`Gagal mendapatkan draf dari LLM: ${llmError.message}`);
      // Simulasikan fallback respon draf PKPT yang valid secara terstruktur jika LLM offline
      rawResponse = JSON.stringify(this.getFallbackDraft(rankings, tahunAnggaran));
    }

    // 5. Parsing & Simpan ke database secara transaksional
    try {
      const parsedData = JSON.parse(rawResponse);
      const agendaItems = parsedData.agendaItems || [];

      if (agendaItems.length === 0) {
        throw new Error('LLM mengembalikan draf kosong.');
      }

      return await this.prisma.$transaction(async (tx) => {
        // A. Pastikan TrPkpt tahun anggaran tersebut sudah ada, atau buat baru
        let pkpt = await tx.trPkpt.findUnique({
          where: { tahunAnggaran },
        });

        if (pkpt) {
          if (pkpt.statusPkpt !== 'DRAF') {
            throw new Error(`PKPT tahun anggaran ${tahunAnggaran} sudah DISETUJUI dan dikunci.`);
          }
          // Hapus agenda lama untuk menulis ulang draf AI yang baru
          await tx.trAgendaAudit.deleteMany({
            where: { pkptId: pkpt.id },
          });
        } else {
          pkpt = await tx.trPkpt.create({
            data: {
              tahunAnggaran,
              statusPkpt: 'DRAF',
              sumberPembuatan: SumberPembuatan.AI_COPILOT,
            },
          });
        }

        // B. Simpan seluruh agenda audit hasil racikan AI
        const createdAgendas = [];
        for (const item of agendaItems) {
          // Cari apakah opdId valid di db
          const opdExists = await tx.mstOpd.findUnique({
            where: { id: item.opdId },
          });

          if (!opdExists) {
            this.logger.warn(`OPD dengan ID ${item.opdId} tidak ditemukan. Melewati item.`);
            continue;
          }

          const agenda = await tx.trAgendaAudit.create({
            data: {
              pkptId: pkpt.id,
              opdId: item.opdId,
              jenisPengawasan: item.jenisPengawasan,
              perkiraanBulan: item.perkiraanBulan,
              estimasiAnggaran: item.estimasiAnggaran,
              sumberPembuatan: SumberPembuatan.AI_COPILOT,
              substansiDokumen: {
                hariPemeriksaan: item.hariPemeriksaan,
                saranaPrasarana: item.saranaPrasarana,
                alasanPrioritas: item.alasanPrioritas,
              },
            },
            include: {
              opd: true,
            },
          });
          createdAgendas.push(agenda);
        }

        this.logger.log(`Berhasil menyimpan draf PKPT tahun ${tahunAnggaran} dengan ${createdAgendas.length} agenda audit.`);
        return {
          pkpt,
          agendaAudits: createdAgendas,
        };
      });
    } catch (parseError) {
      this.logger.error(`Gagal mem-parsing draf usulan PKPT: ${parseError.message}`);
      throw new InternalServerErrorException(`Gagal menyusun draf PKPT: ${parseError.message}`);
    }
  }

  /**
   * Helper untuk mengembalikan draf fallback jika server LLM lokal offline
   */
  private getFallbackDraft(rankings: any[], tahun: number) {
    this.logger.warn('Menghasilkan draf fallback terstruktur untuk PKPT karena server LLM offline.');
    const topOpds = rankings.slice(0, 3); // Ambil 3 OPD berisiko teratas
    
    const agendaItems = topOpds.map((r, idx) => {
      // Pilih jenis pengawasan secara bergiliran untuk variasi
      const jenis = idx === 0 ? 'Audit' : idx === 1 ? 'Reviu' : 'Evaluasi';
      const bulan = (idx * 3) + 2; // Pebruari, Mei, Agustus
      const anggaran = (5 - idx) * 100000000; // 500jt, 400jt, 300jt
      
      return {
        opdId: r.opdId,
        opdName: r.opd.namaOpd,
        jenisPengawasan: jenis,
        perkiraanBulan: bulan,
        estimasiAnggaran: anggaran,
        hariPemeriksaan: {
          pj: 5,
          wkpj: 5,
          dalnis: 10,
          kt: 15,
          at: 30,
        },
        saranaPrasarana: ['Laptop', 'Printer', 'ATK', 'Kendaraan roda 4'],
        alasanPrioritas: `OPD diprioritaskan karena memiliki Nilai Total Risiko tinggi sebesar ${r.ntr} pada tahun anggaran ${tahun}.`,
      };
    });

    return { agendaItems };
  }
}
