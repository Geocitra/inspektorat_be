// src/lhp/services/feedback-analyzer.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VendorLlmAdapter } from '../../common/ai/vendor-llm.adapter';
import { DocumentRepository } from '../../document-ingestion/repositories/document.repository';
import { ExternalEmbeddingAdapter } from '../../document-ingestion/providers/external-embedding.adapter';
import { DocumentIngestionService } from '../../document-ingestion/services/document-ingestion.service';
import { FeedbackAnalysisSchema } from '../schemas/feedback-analysis.schema';
import { DocumentType } from '@prisma/client';
import * as pdfParse from 'pdf-parse';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FeedbackAnalyzerService {
    private readonly logger = new Logger(FeedbackAnalyzerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly llmAdapter: VendorLlmAdapter,
        private readonly docRepository: DocumentRepository,
        private readonly embeddingAdapter: ExternalEmbeddingAdapter,
        private readonly ingestionService: DocumentIngestionService,
    ) { }

    /**
     * Mengurai file PDF tanggapan OPD, melakukan RAG kriteria hukum, dan mengevaluasi justifikasi kelayakan.
     */
    async analyzeFeedback(lhpId: string, file: any): Promise<any> {
        this.logger.log(`Memulai pembacaan surat jawaban OPD untuk LHP ID: ${lhpId}...`);

        const lhp = await this.prisma.trLhp.findUnique({
            where: { id: lhpId },
            include: {
                suratTugas: {
                    include: {
                        kkas: {
                            include: {
                                itemAudits: true,
                            },
                        },
                    },
                },
            },
        });

        if (!lhp) {
            throw new NotFoundException('Laporan LHP / NHP tidak ditemukan.');
        }

        // 1. Ekstrak Teks dari PDF Tanggapan OPD secara langsung menggunakan pdf-parse
        let rawFeedbackText = '';
        try {
            const data = await pdfParse(file.buffer);
            rawFeedbackText = data.text || '';
        } catch (parseError) {
            throw new BadRequestException(`Gagal mengurai file biner PDF tanggapan: ${parseError.message}`);
        }

        if (rawFeedbackText.trim().length < 10) {
            throw new BadRequestException('Surat jawaban OPD tidak valid atau tidak mengandung teks yang cukup untuk dianalisis.');
        }

        // 2. Cari Regulasi Penyelamatan/Kelayakan Hukum (RAG) di Global Vector Store
        const queryText = `kelayakan adendum kontrak pengadaan force majeure keterlambatan barang jasa ${rawFeedbackText.substring(0, 100)}`;
        let queryVector: number[];
        try {
            queryVector = await this.embeddingAdapter.generateEmbedding(queryText);
        } catch (e) {
            queryVector = new Array(1536).fill(0);
        }

        const ruleChunks = await this.docRepository.searchSimilarity(queryVector, 3);
        const rulesContext = ruleChunks
            .map((c) => `[ATURAN PENGADAAN] Sumber: ${c.document.title}\nKonten: ${c.content}`)
            .join('\n\n');

        // Ambil data anomali spidol/barang pengadaan untuk di-evaluasi bersama draf pembelaan OPD
        const anomalies = lhp.suratTugas.kkas.flatMap((k) => k.itemAudits).filter((a) => a.status === 'ANOMALI');

        const anomalyString = anomalies
            .map((a) => `- Temuan: "${a.itemName}" (Deviasi: Rp ${Number(a.selisihHarga).toLocaleString('id-ID')})`)
            .join('\n');

        // 3. Bangun Prompt Triage AI
        const systemPrompt = `Anda adalah AI Pakar Evaluator Justifikasi Hukum Daerah di Inspektorat.
Tugas Anda adalah membaca argumen pembelaan dari OPD (Auditee) atas temuan anomali audit, lalu membandingkannya dengan regulasi pengadaan daerah yang berlaku untuk memutuskan kelayakannya.
Anda WAJIB memberikan hasil penilaian berbentuk JSON terstruktur yang mengikuti JSON Schema yang diberikan.`;

        const userPrompt = `
=== SURAT JAWABAN/JUSTIFIKASI OPD (KONDISI PEMBELAAN) ===
${rawFeedbackText}

=== DAFTAR ANOMALI PBJ YANG DITUDUHKAN ===
${anomalyString || 'Terjadi penyimpangan spesifikasi administratif barang.'}

=== REGULASI PBJ DAERAH (KRITERIA KELAYAKAN ADENDUM) ===
${rulesContext}

Pertanyaan Evaluasi:
- Apakah alasan OPD (misal: kelangkaan stok pasar, bencana alam, penghematan anggaran) sah secara hukum pengadaan untuk memaklumi pembelian barang yang berbeda?
- Apakah mereka melampirkan dasar adendum kontrak secara sah?
- Berikan keputusan akhir status rekomendasi: "TUNTAS" (jika draf alasan sah) atau "TETAP_TEMUAN" (jika alasan dicurigai mengada-ada atau melanggar hukum).

JSON Schema Output yang WAJIB diikuti:
${JSON.stringify(FeedbackAnalysisSchema)}

Berikan output JSON sekarang:`;

        this.logger.log('Mengirimkan analisis justifikasi ke LLM...');
        let rawResponse: string;
        try {
            rawResponse = await this.llmAdapter.callLlm(systemPrompt, userPrompt, {
                jsonMode: true,
                temperature: 0.1,
            });
        } catch (llmError) {
            this.logger.error(`AI offline, menjalankan fallback keputusan tetap temuan: ${llmError.message}`);
            rawResponse = JSON.stringify({
                isJustificationValid: false,
                rekomendasiStatus: 'TETAP_TEMUAN',
                confidenceScore: 0.5,
                analisisKepatuhan: '[FALLBACK SYSTEM] Evaluasi justifikasi gagal dilakukan secara otomatis karena gangguan LLM. Rekomendasi status: tetap diajukan sebagai temuan.',
            });
        }

        try {
            const parsedAnalysis = JSON.parse(rawResponse);

            // Gunakan DocumentIngestionService agar dokumen di-chunk dan di-embed ke vector store
            const title = `Surat Tanggapan OPD - ST ${lhp.suratTugas.nomorSt}`;
            const savedDoc = await this.ingestionService.ingestDocument(file, DocumentType.ADENDUM_JUSTIFIKASI, title);

            // Kaitkan dokumen yang sudah di-ingest ke Surat Tugas dan simpan ringkasan hasil evaluasi
            await this.prisma.$transaction(async (tx) => {
                // Jika ingestion tidak mengisi stId, pastikan ter-link ke st saat ini
                if (savedDoc && savedDoc.id) {
                    await tx.auditDocument.update({
                        where: { id: savedDoc.id },
                        data: { stId: lhp.stId },
                    });
                }

                // Simpan log hasil evaluasi AI ke ringkasan eksekutif draf LHP
                await tx.trLhp.update({
                    where: { id: lhpId },
                    data: {
                        ringkasanEksekutif: `[EVALUASI JUSTIFIKASI OPD - AI COPILOT]:\n` +
                            `Hasil Kelayakan: ${parsedAnalysis.isJustificationValid ? 'SAH/LAYAK' : 'TIDAK LAYAK'}\n` +
                            `Keputusan: ${parsedAnalysis.rekomendasiStatus}\n` +
                            `Analisis: ${parsedAnalysis.analisisKepatuhan}`,
                    },
                });
            });

            this.logger.log(`Evaluasi justifikasi selesai. Keputusan: ${parsedAnalysis.rekomendasiStatus}`);
            return parsedAnalysis;
        } catch (parseError) {
            this.logger.error(`Gagal mem-parsing evaluasi: ${parseError.message}`);
            throw new InternalServerErrorException(`Gagal mengevaluasi tanggapan: ${parseError.message}`);
        }
    }
}