// src/lhp/services/nhp-generator.service.ts
import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VendorLlmAdapter } from '../../common/ai/vendor-llm.adapter';
import { DocumentRepository } from '../../document-ingestion/repositories/document.repository';
import { ExternalEmbeddingAdapter } from '../../document-ingestion/providers/external-embedding.adapter';
import { NhpDraftOutputSchema } from '../schemas/nhp-draft-output.schema';
import { DocumentType, SumberPembuatan } from '@prisma/client';

@Injectable()
export class NhpGeneratorService {
    private readonly logger = new Logger(NhpGeneratorService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly llmAdapter: VendorLlmAdapter,
        private readonly docRepository: DocumentRepository,
        private readonly embeddingAdapter: ExternalEmbeddingAdapter,
    ) { }

    /**
     * Mengagregasi anomali KKA dan PBJ, lalu menyusun draf NHP terstruktur via RAG & LLM.
     */
    async generateNhp(stId: string): Promise<any> {
        this.logger.log(`Memulai kompilasi draf NHP AI untuk Surat Tugas ID: ${stId}...`);

        // 1. Ambil seluruh KKA berstatus APPROVED milik ST ini
        const kkas = await this.prisma.trKka.findMany({
            where: {
                stId,
                statusKka: 'APPROVED',
            },
            include: {
                itemAudits: {
                    where: {
                        status: 'ANOMALI',
                    },
                },
            },
        });

        if (kkas.length === 0) {
            throw new NotFoundException('Tidak ditemukan Kertas Kerja Audit (KKA) berstatus APPROVED untuk Surat Tugas ini.');
        }

        // 2. Kumpulkan seluruh anomali barang PBJ dari database
        const anomalies = kkas.flatMap((k) => k.itemAudits);
        if (anomalies.length === 0) {
            return {
                message: 'Hasil audit bersih. Tidak ditemukan anomali pengadaan PBJ pada KKA kasus ini.',
                temuanUtama: [],
            };
        }

        const anomalySummary = anomalies
            .map((a, idx) => {
                return `${idx + 1}. Item SPJ: "${a.itemName}" (Harga Satuan SPJ: Rp ${Number(a.priceActual).toLocaleString('id-ID')}, Volume SPJ: ${Number(a.volumeActual)})\n` +
                    `   - Rencana RKA: "${a.specRequired || '-'}" (Harga Satuan RKA: Rp ${Number(a.priceContract).toLocaleString('id-ID')})\n` +
                    `   - Deviasi Finansial: Rp ${Number(a.selisihHarga).toLocaleString('id-ID')}\n` +
                    `   - Analisis Awal: ${a.analisisCopilot || '-'}`;
            })
            .join('\n\n');

        // 3. Ambil Regulasi Terkait (Kriteria) & Contoh Template via Semantik RAG
        const queryText = `contoh dokumen NHP LHP template laporan pengawasan pedoman penulisan naskah hasil pemeriksaan temuan PBJ pengadaan barang jasa ${anomalies[0].itemName}`;
        let queryVector: number[];
        try {
            queryVector = await this.embeddingAdapter.generateEmbedding(queryText);
        } catch (e) {
            queryVector = new Array(1536).fill(0);
        }

        const criteriaChunks = await this.docRepository.searchSimilarity(queryVector, 3);
        const criteriaText = criteriaChunks
            .map((c) => `[ACUAN REGULASI & TEMPLATE REFERENSI] Sumber: ${c.document.title}\nKonten: ${c.content}`)
            .join('\n\n');

        // 4. Bangun Prompt BPK/APIP Standard
        const systemPrompt = `Anda adalah AI Asisten Auditor Utama (Copilot) di Inspektorat Daerah.
Tugas Anda adalah merangkum seluruh anomali pengadaan barang jasa yang ditemukan di lapangan menjadi sebuah laporan draf temuan Naskah Hasil Pemeriksaan (NHP) resmi.
Laporan draf temuan wajib disusun terstruktur per kelompok permasalahan, menggunakan format baku pengawasan: KONDISI, KRITERIA, SEBAB, AKIBAT, dan REKOMENDASI.
Anda WAJIB meniru gaya bahasa formal birokrasi, struktur kalimat tajam, dan format paragraf dari TEMPLATE REFERENSI yang diberikan.
Anda WAJIB memberikan respon berbentuk objek JSON bersih yang mematuhi JSON Schema yang diberikan.`;

        const userPrompt = `
=== DAFTAR ANOMALI PBJ YANG DITEMUKAN (KONDISI AKTUAL) ===
${anomalySummary}

=== ACUAN REGULASI KEPATUHAN & CONTOH TEMPLATE REFERENSI MASA LALU (RAG) ===
${criteriaText || 'Gunakan standar kepatuhan administrasi daerah Perpres Pengadaan Barang dan Jasa Pemerintah.'}

Berdasarkan data kondisi aktual dan contoh template referensi masa lalu di atas, susunlah draf temuan pengawasan NHP secara formal, tajam, objektif, dan dengan tata bahasa birokrasi pengawasan yang sesuai dengan contoh referensi.

JSON Schema Output yang WAJIB diikuti:
${JSON.stringify(NhpDraftOutputSchema)}

Berikan output JSON sekarang:`;

        this.logger.log('Mengirimkan draf kompilasi NHP ke LLM lokal...');
        let rawResponse: string;
        try {
            rawResponse = await this.llmAdapter.callLlm(systemPrompt, userPrompt, {
                jsonMode: true,
                temperature: 0.1,
            });
        } catch (err) {
            this.logger.error(`Koneksi LLM gagal. Menjalankan fallback draf NHP: ${err.message}`);
            rawResponse = JSON.stringify(this.getFallbackNhp(anomalies));
        }

        try {
            const parsedData = JSON.parse(rawResponse);

            // Simpan draf NHP ke database TrLhp (Upsert) agar dapat direviu manusia
            await this.prisma.trLhp.upsert({
                where: { stId },
                update: {
                    substansiNhp: parsedData,
                    sumberPembuatan: SumberPembuatan.AI_COPILOT,
                },
                create: {
                    stId,
                    nomorLhp: `DRAF-NHP-${stId.substring(0, 8).toUpperCase()}`,
                    ringkasanEksekutif: 'Menunggu Penyusunan LHP Final',
                    fileLhpSignedPath: '',
                    substansiNhp: parsedData,
                    sumberPembuatan: SumberPembuatan.AI_COPILOT,
                },
            });

            this.logger.log(`Berhasil menyusun draf NHP untuk Surat Tugas ID: ${stId}`);
            return parsedData;
        } catch (parseError) {
            this.logger.error(`Gagal mem-parsing hasil NHP: ${parseError.message}`);
            throw new InternalServerErrorException(`Gagal menyusun NHP: ${parseError.message}`);
        }
    }

    private getFallbackNhp(anomalies: any[]) {
        return {
            temuanUtama: [
                {
                    judulTemuan: 'Ketidaksesuaian Spesifikasi Pengadaan Barang Jasa pada OPD Terkait',
                    kondisi: `Ditemukan pembelian ${anomalies.length} item pengadaan yang tidak sesuai spesifikasi perencanaan dengan akumulasi deviasi finansial sebesar Rp ${anomalies.reduce((acc, curr) => acc + Number(curr.selisihHarga || 0), 0).toLocaleString('id-ID')}.`,
                    kriteria: 'Peraturan Presiden Republik Indonesia tentang Pengadaan Barang/Jasa Pemerintah Daerah wajib dilaksanakan secara transparan, efektif, dan ekonomis.',
                    sebab: 'Kelalaian Pejabat Pembuat Komitmen (PPK) dalam mengawasi spesifikasi barang pengiriman dari penyedia.',
                    akibat: 'Penggunaan anggaran daerah tidak sesuai peruntukan serta berpotensi menyebabkan inefisiensi pengadaan barang jasa.',
                    rekomendasi: 'Memerintahkan Kepala OPD untuk memberikan penjelasan resmi tertulis dan mengembalikan selisih harga jika tidak didukung justifikasi yang sah.',
                },
            ],
        };
    }
}