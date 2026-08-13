// src/audit-planning/services/pkpt-generator.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RiskAssessmentService } from './risk-assessment.service';
import { DocumentRepository } from '../../document-ingestion/repositories/document.repository';
import { VendorLlmAdapter } from '../../common/ai/vendor-llm.adapter';
import { ParserFactory } from '../../document-ingestion/parsers/parser.factory';
import { PkptDraftOutputSchema } from '../schemas/pkpt-draft-output.schema';
import { SumberPembuatan } from '@prisma/client';
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
    private readonly parserFactory: ParserFactory,
  ) { }

  /**
   * JALUR A: Menyusun draf PKPT otomatis (Zero-to-Hero) berbasis RAG dan ranking risiko OPD
   */
  async generateDraftPkpt(tahunAnggaran: number, instruksiTambahan?: string) {
    this.logger.log(`Memulai orkestrasi generasi draf PKPT berbasis AI untuk tahun anggaran ${tahunAnggaran}...`);

    let rankings = await this.riskService.getRiskRanking(tahunAnggaran);
    if (rankings.length === 0) {
      rankings = await this.riskService.calculateRisk(tahunAnggaran);
    }

    const rankingString = rankings
      .slice(0, 10)
      .map((r, idx) => `${idx + 1}. OPD: ${r.opd.namaOpd} (ID: ${r.opdId}, NTR: ${r.ntr}, NRI: ${r.nri}, NFR: ${r.nfr})`)
      .join('\n');

    const queryText = `pedoman kriteria tata cara penyusunan PKPT pengawasan Inspektorat ${instruksiTambahan || ''}`;
    let queryVector: number[];
    try {
      queryVector = await this.embeddingAdapter.generateEmbedding(queryText);
    } catch (e) {
      queryVector = new Array(1536).fill(0);
    }

    const criteriaChunks = await this.docRepository.searchSimilarity(queryVector, 3);

    let criteriaText = '';
    if (criteriaChunks && criteriaChunks.length > 0) {
      criteriaText = criteriaChunks
        .map((c) => `[CRITERIA] Sumber: ${c.document.title}\nKonten: ${c.content}`)
        .join('\n\n');
    } else {
      const fallbackChunks = await this.docRepository.searchKeyword('PKPT', 3);
      criteriaText = fallbackChunks
        .map((c) => `[CRITERIA] Sumber: ${c.document.title}\nKonten: ${c.content}`)
        .join('\n\n');
    }

    const systemPrompt = `Anda adalah AI Asisten Analitis dan Penyusun Draf (Copilot) untuk Inspektorat Daerah.
Tugas Anda adalah menyusun usulan draf program kerja pengawasan tahunan (PKPT) & Agenda Audit untuk OPD-OPD berdasarkan tingkat risiko (NTR), data anggaran/geografis, dan pedoman regulasi pengawasan.
Anda WAJIB mengembalikan output dalam format JSON terstruktur yang mengikuti JSON Schema yang diberikan. Jangan mengarang data di luar konteks. Jangan menambahkan penjelasan teks Markdown di luar objek JSON.`;

    const userPrompt = `Tahun Anggaran: ${tahunAnggaran}
Instruksi Tambahan User: ${instruksiTambahan || 'Tidak ada'}

Berikut adalah Daftar 10 OPD Ter-ranking berdasarkan Nilai Total Risiko (NTR):
${rankingString}

Berikut adalah Regulasi Acuan (Kriteria):
${criteriaText || 'Gunakan pedoman standard audit berbasis risiko Inspektorat.'}

Anda WAJIB menghasilkan draf usulan pengawasan untuk OPD-OPD di atas.
Pecah Hari Pemeriksaan (HP) untuk masing-masing peran tim (PJ, WKPJ, Dalnis, KT, AT) secara logis sesuai tingkat kesulitan.

JSON Schema Output yang WAJIB diikuti:
${JSON.stringify(PkptDraftOutputSchema)}

Berikan output JSON sekarang:`;

    this.logger.log('Mengirim permintaan draf PKPT (Mode A) ke LLM lokal...');
    let rawResponse: string;
    try {
      rawResponse = await this.llmAdapter.callLlm(systemPrompt, userPrompt, {
        jsonMode: true,
        temperature: 0.1,
      });
    } catch (llmError: any) { // [FIX] Added : any
      this.logger.error(`Gagal mendapatkan draf dari LLM: ${llmError.message}`);
      rawResponse = JSON.stringify(this.getFallbackDraft(rankings, tahunAnggaran));
    }

    return this.processAndSaveDraft(tahunAnggaran, rawResponse, SumberPembuatan.AI_COPILOT);
  }

  /**
   * JALUR B: Menyusun draf PKPT dari ekstraksi berkas (Excel/PDF) PKPT eksisting.
   * Menggunakan Fuzzy Matching agar data relasional tidak rusak.
   */
  async parseExistingPkpt(tahunAnggaran: number, file: any) {
    this.logger.log(`Memulai ekstraksi draf PKPT dari file "${file.originalname}" untuk tahun ${tahunAnggaran}...`);

    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
    const parser = this.parserFactory.getParser(file.mimetype, ext);
    let extractedText = await parser.parse(file.buffer);

    if (extractedText.length > 25000) {
      extractedText = extractedText.substring(0, 25000);
      this.logger.warn('Teks diekstraksi sangat panjang, dipotong hingga 25.000 karakter.');
    }

    const masterOpdList = await this.prisma.mstOpd.findMany({
      select: { id: true, namaOpd: true },
    });

    const opdReference = masterOpdList
      .map(o => `- ID: ${o.id} | Nama Resmi: ${o.namaOpd}`)
      .join('\n');

    const systemPrompt = `Anda adalah AI Asisten Data Ekstraktor untuk Inspektorat Daerah.
Tugas Anda adalah membaca teks acak/tabel dari dokumen PKPT mentah, dan mengekstrak jadwal, anggaran, serta alokasi hari pemeriksaan ke dalam format JSON.
SANGAT PENTING: Anda WAJIB mencocokkan (Fuzzy Match) nama instansi/OPD di dokumen mentah dengan DAFTAR OPD RESMI yang diberikan. 
Anda HANYA BOLEH menggunakan 'opdId' dan 'opdName' yang terdapat di dalam daftar resmi tersebut. Jika tidak yakin, pilih yang ejaannya paling mirip.
Anda WAJIB mengembalikan output dalam format JSON terstruktur. Jangan tambahkan Markdown.`;

    const userPrompt = `Tahun Anggaran: ${tahunAnggaran}

=== DAFTAR OPD RESMI (GUNAKAN INI UNTUK REFERENSI opdId DAN opdName) ===
${opdReference}

=== ISI DOKUMEN PKPT MENTAH YANG DIUNGGAH ===
${extractedText}

Tugas:
1. Ekstrak setiap baris tabel pengawasan dari dokumen mentah.
2. Identifikasi nama instansinya, lalu cocokkan dengan Daftar OPD Resmi untuk mendapatkan opdId yang benar.
3. Ekstrak estimasi anggaran, jadwal bulan, dan matriks Hari Pemeriksaan (jika ada). Jika kosong, buat estimasi logis (misal anggaran 0, atau HP standar).

JSON Schema Output yang WAJIB diikuti:
${JSON.stringify(PkptDraftOutputSchema)}

Berikan output JSON sekarang:`;

    this.logger.log('Mengirim permintaan ekstraksi PKPT (Mode B) ke LLM lokal...');
    let rawResponse: string;
    try {
      rawResponse = await this.llmAdapter.callLlm(systemPrompt, userPrompt, {
        jsonMode: true,
        temperature: 0.1,
      });
    } catch (llmError: any) { // [FIX] Added : any
      this.logger.error(`Gagal mengekstrak dokumen via LLM: ${llmError.message}`);
      throw new InternalServerErrorException(`Gagal memproses dokumen PKPT: Server AI tidak merespons.`);
    }

    return this.processAndSaveDraft(tahunAnggaran, rawResponse, SumberPembuatan.SYSTEM);
  }

  /**
   * Logika Bersama: Menyimpan JSON hasil AI ke PostgreSQL
   */
  private async processAndSaveDraft(tahunAnggaran: number, rawResponse: string, sumberPembuatan: SumberPembuatan) {
    try {
      const parsedData = JSON.parse(rawResponse);
      const agendaItems = parsedData.agendaItems || [];

      if (agendaItems.length === 0) {
        throw new Error('LLM tidak menemukan atau mengembalikan agenda kosong.');
      }

      return await this.prisma.$transaction(async (tx) => {
        let pkpt = await tx.trPkpt.findUnique({
          where: { tahunAnggaran },
        });

        if (pkpt) {
          if (pkpt.statusPkpt !== 'DRAF') {
            throw new Error(`PKPT tahun anggaran ${tahunAnggaran} sudah DISETUJUI dan dikunci.`);
          }
          await tx.trAgendaAudit.deleteMany({
            where: { pkptId: pkpt.id },
          });
        } else {
          pkpt = await tx.trPkpt.create({
            data: {
              tahunAnggaran,
              statusPkpt: 'DRAF',
              sumberPembuatan,
            },
          });
        }

        const createdAgendas = [];
        for (const item of agendaItems) {
          const opdExists = await tx.mstOpd.findUnique({
            where: { id: item.opdId },
          });

          if (!opdExists) {
            this.logger.warn(`Pencocokan Fuzzy Match Gagal: OPD dengan ID ${item.opdId} tidak ditemukan. Melewati item ini.`);
            continue;
          }

          const agenda = await tx.trAgendaAudit.create({
            data: {
              pkptId: pkpt.id,
              opdId: item.opdId,
              jenisPengawasan: item.jenisPengawasan,
              perkiraanBulan: item.perkiraanBulan,
              estimasiAnggaran: item.estimasiAnggaran,
              sumberPembuatan,
              substansiDokumen: {
                hariPemeriksaan: item.hariPemeriksaan,
                saranaPrasarana: item.saranaPrasarana,
                alasanPrioritas: item.alasanPrioritas || 'Hasil ekstraksi dokumen PKPT manual.',
              },
            },
            include: { opd: true },
          });
          createdAgendas.push(agenda);
        }

        this.logger.log(`Berhasil menyimpan draf PKPT tahun ${tahunAnggaran} dengan ${createdAgendas.length} agenda audit.`);
        return {
          pkpt,
          agendaAudits: createdAgendas,
        };
      });
    } catch (parseError: any) { // [FIX] Added : any
      this.logger.error(`Gagal mem-parsing atau menyimpan draf usulan PKPT: ${parseError.message}`);
      throw new InternalServerErrorException(`Gagal menyusun draf PKPT: ${parseError.message}`);
    }
  }

  private getFallbackDraft(rankings: any[], tahun: number) {
    this.logger.warn('Menghasilkan draf fallback terstruktur untuk PKPT karena server LLM offline.');
    const topOpds = rankings.slice(0, 3);

    const agendaItems = topOpds.map((r, idx) => {
      const jenis = idx === 0 ? 'Audit' : idx === 1 ? 'Reviu' : 'Evaluasi';
      const bulan = (idx * 3) + 2;
      const anggaran = (5 - idx) * 100000000;

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