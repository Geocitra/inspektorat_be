// src/kka/services/semantic-audit.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VendorLlmAdapter } from '../../common/ai/vendor-llm.adapter';
import { DocumentRepository } from '../../document-ingestion/repositories/document.repository';
import { ExternalEmbeddingAdapter } from '../../document-ingestion/providers/external-embedding.adapter';
import { DocumentType, SumberPembuatan, Prisma } from '@prisma/client';
import { NormalizedPbjRow } from './pbj-parser.service';

export const PbjAuditOutputSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'PbjAuditOutput',
    type: 'object',
    properties: {
        isMismatch: {
            type: 'boolean',
            description: 'True jika terdapat perbedaan spesifikasi fisik, merk, warna, ukuran, atau tipe antara rencana dan realisasi.',
        },
        similarityScore: {
            type: 'number',
            minimum: 0.0,
            maximum: 1.0,
            description: 'Skor kemiripan semantik fungsi barang antara Rencana vs Realisasi (0.0 s.d 1.0)',
        },
        specRequired: {
            type: 'string',
            description: 'Nama/spesifikasi barang yang direncanakan di dokumen RKA hasil pencocokan semantik RAG.',
        },
        priceContract: {
            type: 'number',
            minimum: 0.0,
            description: 'Harga satuan rencana anggaran (RKA) dalam Rupiah hasil ekstraksi dari teks referensi.',
        },
        volumeContract: {
            type: 'number',
            minimum: 0,
            description: 'Volume barang yang direncanakan di RKA hasil ekstraksi dari teks referensi.',
        },
        sshStandardPrice: {
            type: 'number',
            minimum: 0.0,
            description: 'Batas harga satuan tertinggi barang tersebut di pasar menurut regulasi SSH hasil pencocokan semantik RAG.',
        },
        analisisCopilot: {
            type: 'string',
            description: 'Analisis formal naratif audit membandingkan Kondisi vs Kriteria (menyebutkan merk/warna yang menyimpang, serta perbandingan harga kuitansi vs SSH daerah).',
        },
    },
    required: ['isMismatch', 'similarityScore', 'specRequired', 'priceContract', 'volumeContract', 'sshStandardPrice', 'analisisCopilot'],
};

@Injectable()
export class SemanticAuditService {
    private readonly logger = new Logger(SemanticAuditService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly llmAdapter: VendorLlmAdapter,
        private readonly docRepository: DocumentRepository,
        private readonly embeddingAdapter: ExternalEmbeddingAdapter,
    ) { }

    /**
     * Mengeksekusi komparasi semantik dan deterministik untuk satu baris item SPJ.
     */
    async compareAndAuditItem(
        stId: string,
        kkaId: string,
        spjItem: NormalizedPbjRow,
        documentId?: string,
    ): Promise<any> {
        this.logger.log(`[Semantic PBJ Audit] Menganalisis baris SPJ ke-${spjItem.rowNumber}: "${spjItem.itemName}"`);

        // 1. Dapatkan vektor pencarian semantik dari nama barang realisasi
        let queryVector: number[];
        try {
            queryVector = await this.embeddingAdapter.generateEmbedding(`Rincian barang kuitansi: ${spjItem.itemName}`);
        } catch (e) {
            this.logger.warn(`Gagal membuat embedding kueri. Menggunakan fallback zero-vector.`);
            queryVector = new Array(1536).fill(0);
        }

        // 2. CONTEXT RETRIEVAL A: Cari baris rencana RKA terdekat pada Surat Tugas ini (Scoped RAG)
        const rkaChunks = await this.prisma.docChunk.findMany({
            where: {
                document: {
                    stId: stId,
                    type: DocumentType.RKA_PERENCANAAN,
                },
            },
        });

        let rkaContextText = 'Tidak ditemukan dokumen RKA Rencana Anggaran resmi untuk audit ini di database.';
        if (rkaChunks.length > 0) {
            const matchedRka = this.findClosestSemanticChunk(queryVector, rkaChunks);
            if (matchedRka && matchedRka.similarity > 0.3) {
                rkaContextText = `[REFERENSI RENCANA BELANJA DPA/RKA] (Similarity: ${matchedRka.similarity.toFixed(2)})\n${matchedRka.chunk.content}`;
            }
        }

        // 3. CONTEXT RETRIEVAL B: Cari harga batas SSH di Regulasi Daerah Global (Global RAG)
        let sshContextText = 'Tidak ditemukan dokumen regulasi Standar Satuan Harga (SSH) resmi daerah di database.';
        try {
            const sshChunks = await this.prisma.docChunk.findMany({
                where: {
                    document: {
                        type: DocumentType.REGULASI_DAERAH,
                        title: {
                            contains: 'SSH',
                            mode: 'insensitive',
                        },
                    },
                },
            });

            if (sshChunks.length > 0) {
                const matchedSsh = this.findClosestSemanticChunk(queryVector, sshChunks);
                if (matchedSsh && matchedSsh.similarity > 0.3) {
                    sshContextText = `[BATAS MAKSIMAL HARGA PASAR STANDAR SATUAN HARGA (SSH)] (Similarity: ${matchedSsh.similarity.toFixed(2)})\n${matchedSsh.chunk.content}`;
                }
            }
        } catch (err) {
            this.logger.warn(`Gagal memuat kueri SSH global: ${err.message}`);
        }

        // 4. GENERATE AI DRAFT ANALYSIS
        const systemPrompt = `Anda adalah AI Auditor PBJ Senior di Inspektorat Daerah.
Tugas Anda adalah mendeteksi ketidaksesuaian spesifikasi fisik (warna, ukuran, merk, tipe) barang dan membandingkan harga kuitansi dengan kriteria RKA daerah & regulasi SSH.
Anda WAJIB mengembalikan draf analisis dalam format objek JSON terstruktur yang mengikuti JSON Schema yang diberikan. Hindari halusinasi.`;

        const userPrompt = `
=== KONDISI FISIK LAPANGAN (SPJ KUITANSI) ===
- Nama Barang Dibeli: "${spjItem.itemName}"
- Volume Dibeli: ${spjItem.volume}
- Harga Satuan Dibeli: Rp ${spjItem.price.toLocaleString('id-ID')}

=== KRITERIA ACUAN RAG ===
[RUJUKAN 1: DRAF RKA OPD]
${rkaContextText}

[RUJUKAN 2: ATURAN BATAS SSH DAERAH]
${sshContextText}

Materi Analisis yang Harus Dijawab:
1. Bandingkan deskripsi barang SPJ dengan RKA (Rujukan 1). Apakah terdapat penyimpangan spesifikasi fisik (mismatch)?
2. Bandingkan harga satuan SPJ dengan RKA (Rujukan 1) & batas SSH daerah (Rujukan 2).
3. Susun draf analisis formal naratif audit.

JSON Schema Output yang WAJIB diikuti:
${JSON.stringify(PbjAuditOutputSchema)}

Berikan output JSON sekarang:`;

        let aiResult: any;
        try {
            const rawAi = await this.llmAdapter.callLlm(systemPrompt, userPrompt, {
                jsonMode: true,
                temperature: 0.1,
            });
            aiResult = JSON.parse(rawAi);
        } catch (err) {
            this.logger.warn(`AI Agent gagal menganalisis baris "${spjItem.itemName}". Menjalankan fallback.`);
            aiResult = this.getFallbackAnalysis(spjItem);
        }

        // 5. DETERMINISTIC DEVLIANCE CALCULATOR (Math Engine - Bebas Halusinasi Matematika)
        const priceContract = Number(aiResult.priceContract || 0);
        const volumeContract = Number(aiResult.volumeContract || 0);
        const sshStandardPrice = Number(aiResult.sshStandardPrice || 0);

        // Hitung pemborosan anggaran jika harga kuitansi melebihi rencana RKA atau melebihi batas SSH
        let selisihHarga = 0.0;
        if (priceContract > 0 && spjItem.price > priceContract) {
            selisihHarga = (spjItem.price - priceContract) * spjItem.volume;
        } else if (sshStandardPrice > 0 && spjItem.price > sshStandardPrice) {
            selisihHarga = (spjItem.price - sshStandardPrice) * spjItem.volume;
        }

        // Status anomali ditentukan jika ada mismatch spesifikasi fisik ATAU ada kerugian/selisih harga
        const status = aiResult.isMismatch || selisihHarga > 0 ? 'ANOMALI' : 'SESUAI';

        try {
            // 6. Tulis draf anomali secara terstruktur ke database
            return await this.prisma.trItemAuditPBJ.create({
                data: {
                    kkaId,
                    documentId: documentId || null,
                    itemName: spjItem.itemName,
                    specRequired: aiResult.specRequired || null,
                    specActual: spjItem.itemName,
                    priceContract: new Prisma.Decimal(priceContract),
                    priceActual: new Prisma.Decimal(spjItem.price),
                    volumeContract: new Prisma.Decimal(volumeContract),
                    volumeActual: new Prisma.Decimal(spjItem.volume),
                    selisihHarga: new Prisma.Decimal(selisihHarga),
                    analisisCopilot: aiResult.analisisCopilot || null,
                    status,
                    sumberPembuatan: SumberPembuatan.AI_COPILOT,
                },
            });
        } catch (dbError) {
            this.logger.error(`Gagal menyimpan draf temuan PBJ ke database: ${dbError.message}`);
            throw new InternalServerErrorException('Gagal melakukan penyimpanan draf temuan PBJ.');
        }
    }

    /**
     * Algoritma internal pencari kedekatan semantik vektor di memori backend (Fallback/Verification).
     */
    private findClosestSemanticChunk(queryVector: number[], chunks: any[]): { chunk: any; similarity: number } | null {
        if (chunks.length === 0) return null;

        let closest = null;
        let maxSimilarity = -1;

        for (const chunk of chunks) {
            if (!chunk.embedding || chunk.embedding.length !== queryVector.length) continue;

            let dotProduct = 0;
            let normA = 0;
            let normB = 0;

            for (let i = 0; i < queryVector.length; i++) {
                dotProduct += queryVector[i] * chunk.embedding[i];
                normA += queryVector[i] * queryVector[i];
                normB += chunk.embedding[i] * chunk.embedding[i];
            }

            const similarity = normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
                closest = chunk;
            }
        }

        return closest ? { chunk: closest, similarity: maxSimilarity } : null;
    }

    private getFallbackAnalysis(spjItem: NormalizedPbjRow) {
        return {
            isMismatch: true,
            similarityScore: 0.5,
            specRequired: 'Tidak Teridentifikasi (AI Offline Fallback)',
            priceContract: 0.0,
            volumeContract: 0.0,
            sshStandardPrice: 0.0,
            analisisCopilot: `[FALLBACK SYSTEM] Terdeteksi perbedaan penulisan data fisik pengadaan pada baris kuitansi "${spjItem.itemName}". Harap periksa ulang manual.`,
        };
    }
}