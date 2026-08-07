// src/tlhp/services/addendum-validator.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VendorLlmAdapter } from '../../common/ai/vendor-llm.adapter';
import { DocumentRepository } from '../../document-ingestion/repositories/document.repository';
import { ExternalEmbeddingAdapter } from '../../document-ingestion/providers/external-embedding.adapter';
import { AddendumValidationSchema } from '../schemas/addendum-validation.schema';
import { UploadAddendumDto } from '../dto/addendum-upload.dto';
import { DocumentType } from '@prisma/client';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

@Injectable()
export class AddendumValidatorService {
    private readonly logger = new Logger(AddendumValidatorService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly llmAdapter: VendorLlmAdapter,
        private readonly docRepository: DocumentRepository,
        private readonly embeddingAdapter: ExternalEmbeddingAdapter,
    ) { }

    /**
     * Mengevaluasi kelayakan hukum adendum yang diunggah OPD terhadap aturan hukum pengadaan.
     */
    async validateAddendum(rekomendasiId: string, file: any, dto: UploadAddendumDto): Promise<any> {
        this.logger.log(`Memulai evaluasi dokumen adendum untuk rekomendasi ID: ${rekomendasiId}...`);

        // 1. Ambil data Temuan Induk (Kondisi & Kriteria)
        const rekomendasi = await this.prisma.trRekomendasi.findUnique({
            where: { id: rekomendasiId },
            include: {
                temuan: true,
            },
        });

        if (!rekomendasi) {
            throw new NotFoundException('Rekomendasi tidak ditemukan.');
        }

        // 2. Ekstrak teks dari biner dokumen secara dinamis (PDF, DOCX, atau TXT)
        const extractedText = await this.extractText(file);
        if (extractedText.trim().length < 10) {
            throw new BadRequestException('Isi berkas adendum terlalu pendek atau tidak terbaca oleh parser biner.');
        }

        // 3. Cari Klausul Hukum Kelayakan Adendum (RAG) di Global Vector Store
        const queryText = `aturan pasal hukum kelayakan adendum perubahan spesifikasi kontrak ${rekomendasi.temuan.kriteria}`;
        let queryVector: number[];
        try {
            queryVector = await this.embeddingAdapter.generateEmbedding(queryText);
        } catch (e) {
            queryVector = new Array(1536).fill(0);
        }

        const ruleChunks = await this.docRepository.searchSimilarity(queryVector, 3);
        const rulesContext = ruleChunks
            .map((c) => `[RUJUKAN HUKUM] Sumber: ${c.document.title}\nKonten: ${c.content}`)
            .join('\n\n');

        // 4. Susun Draf Prompt Komparatif
        const systemPrompt = `Anda adalah AI Pakar Evaluator Justifikasi Hukum Pengadaan Barang Jasa Pemerintah di Inspektorat.
Tugas Anda adalah menilai keabsahan/kelayakan dokumen adendum kontrak yang diajukan oleh OPD (Auditee) untuk membenarkan ketidaksesuaian barang hasil temuan audit.
Anda WAJIB memberikan hasil penilaian berbentuk objek JSON bersih yang mematuhi JSON Schema yang diberikan. Jangan mengarang data.`;

        const userPrompt = `
=== TEMUAN AUDIT INDUK (KRITERIA VS KONDISI) ===
- Temuan Kondisi Aktual: "${rekomendasi.temuan.kondisi}"
- Kriteria Rencana Awal : "${rekomendasi.temuan.kriteria}"

=== ARGUMEN JUSTIFIKASI OPD ===
"${dto.catatanJustifikasi}"

=== ISI DOKUMEN ADENDUM KONTRAK YANG DIUNGGAH ===
"${extractedText.substring(0, 3000)} ... (terpotong demi token limit)"

=== REFERENSI REGULASI PBJ DAERAH (RAG CONTEXT) ===
${rulesContext}

Pertanyaan Evaluasi Hukum:
- Apakah alasan ketidaksesuaian spesifikasi barang (misal: kelangkaan stok pasar, bencana alam, penghematan anggaran) dibenarkan secara hukum daerah/nasional (Rujukan RAG)?
- Apakah dokumen adendum kontrak yang diunggah memiliki landasan hukum yang sah (pasal hukum)?
- Berikan keputusan akhir status: "TUNTAS" (justifikasi sah) atau "TETAP_TEMUAN" (justifikasi ditolak/melanggar hukum).

JSON Schema Output yang WAJIB diikuti:
${JSON.stringify(AddendumValidationSchema)}

Berikan output JSON sekarang:`;

        this.logger.log('Mengirimkan draf evaluasi adendum ke LLM...');
        let rawResponse: string;
        try {
            rawResponse = await this.llmAdapter.callLlm(systemPrompt, userPrompt, {
                jsonMode: true,
                temperature: 0.1,
            });
        } catch (llmError) {
            this.logger.error(`AI offline, menjalankan fallback penolakan adendum: ${llmError.message}`);
            rawResponse = JSON.stringify({
                isJustificationValid: false,
                rekomendasiStatus: 'TETAP_TEMUAN',
                confidenceScore: 0.5,
                pasalHukumAsosiasi: 'Tidak Teridentifikasi (AI Offline Fallback)',
                analisisKepatuhan: '[FALLBACK SYSTEM] Evaluasi adendum pengadaan gagal dilakukan secara otomatis oleh AI karena masalah koneksi.',
            });
        }

        try {
            return JSON.parse(rawResponse);
        } catch (parseError) {
            this.logger.error(`Gagal mem-parsing evaluasi: ${parseError.message}`);
            throw new InternalServerErrorException(`Gagal mengevaluasi adendum: ${parseError.message}`);
        }
    }

    /**
     * Strategi parser biner internal untuk mengekstrak teks dari berbagai ekstensi file.
     */
    private async extractText(file: any): Promise<string> {
        const originalName = file.originalname || '';
        const extension = originalName.split('.').pop()?.toLowerCase();
        const buffer = file.buffer;

        try {
            if (extension === 'pdf') {
                const data = await pdfParse(buffer);
                return data.text || '';
            } else if (extension === 'docx') {
                const result = await mammoth.extractRawText({ buffer });
                return result.value || '';
            } else if (extension === 'txt') {
                return buffer.toString('utf-8');
            }
        } catch (err) {
            throw new BadRequestException(`Gagal mengurai isi biner file .${extension}: ${err.message}`);
        }

        throw new BadRequestException(`Ekstensi .${extension} tidak didukung untuk dianalisis oleh sistem.`);
    }
}