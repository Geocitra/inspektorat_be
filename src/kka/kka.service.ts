// src/kka/kka.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKkaDto, UpdateKkaDto } from './dto/kka.dto';
import { AuditPbjDto } from './dto/pbj-audit.dto';
import { StatusKka, SumberPembuatan, DocumentType } from '@prisma/client';
import { VendorLlmAdapter } from '../common/ai/vendor-llm.adapter';
import { DocumentRepository } from '../document-ingestion/repositories/document.repository';
import { ExternalEmbeddingAdapter } from '../document-ingestion/providers/external-embedding.adapter';
import * as ExcelJS from 'exceljs';

@Injectable()
export class KkaService {
  private readonly logger = new Logger(KkaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmAdapter: VendorLlmAdapter,
    private readonly docRepository: DocumentRepository,
    private readonly embeddingAdapter: ExternalEmbeddingAdapter,
  ) { }

  /**
   * Membuat KKA baru.
   * Hanya diperbolehkan pada Surat Tugas yang berstatus AKTIF.
   */
  async createKka(dto: CreateKkaDto) {
    const st = await this.prisma.trSuratTugas.findUnique({
      where: { id: dto.stId },
    });
    if (!st) {
      throw new NotFoundException('Surat Tugas tidak ditemukan.');
    }

    if (st.statusSt !== 'AKTIF') {
      throw new ConflictException(
        'KKA hanya dapat dibuat untuk Surat Tugas yang aktif.',
      );
    }

    return this.prisma.trKka.create({
      data: {
        stId: dto.stId,
        pkaId: dto.pkaId || null,
        prosedurPemeriksaan: dto.prosedurPemeriksaan,
        uraianPengujian: dto.uraianPengujian,
        kesimpulanSementara: dto.kesimpulanSementara,
        statusKka: 'DRAF',
      },
    });
  }

  /**
   * Mengkoordinasikan pembacaan data biner Excel, pencarian semantik (RAG),
   * dan pemanggilan LLM untuk mendeteksi anomali realisasi barang (PBJ).
   */
  async auditPbj(id: string, file: any, dto: AuditPbjDto) {
    const kka = await this.prisma.trKka.findUnique({
      where: { id },
      include: { suratTugas: true },
    });

    if (!kka) {
      throw new NotFoundException('Kertas Kerja Audit (KKA) tidak ditemukan.');
    }

    if (kka.statusKka === 'APPROVED') {
      throw new ConflictException('KKA sudah disetujui secara permanen dan tidak dapat dievaluasi kembali.');
    }

    this.logger.log(`Memulai ekstraksi berkas Excel SPJ untuk KKA ID: ${id}`);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer);
    } catch (err) {
      throw new BadRequestException('Berkas Excel rusak atau tidak dapat dibaca oleh parser.');
    }

    const worksheet = workbook.getWorksheet(dto.spjSheetName) || workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException(`Sheet bernama "${dto.spjSheetName}" tidak ditemukan di berkas Excel.`);
    }

    const spjRows: { itemName: string; volume: number; price: number }[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < dto.rowStart) return;

      const itemName = row.getCell(1).text?.trim();
      const volume = parseInt(row.getCell(2).text, 10) || 0;
      const price = parseFloat(row.getCell(3).text) || 0;

      if (itemName) {
        spjRows.push({ itemName, volume, price });
      }
    });

    this.logger.log(`Berhasil mengekstrak ${spjRows.length} baris data kuitansi realisasi.`);

    // Bersihkan rincian temuan lama untuk KKA ini agar tidak duplikat
    await this.prisma.trItemAuditPBJ.deleteMany({
      where: { kkaId: id },
    });

    const auditResults = [];

    for (const spjItem of spjRows) {
      // 1. Dapatkan embedding dari barang yang dibeli (Kondisi)
      let queryVector: number[];
      try {
        queryVector = await this.embeddingAdapter.generateEmbedding(`Rincian barang kuitansi: ${spjItem.itemName}`);
      } catch (e) {
        queryVector = new Array(1536).fill(0);
      }

      // 2. Lakukan RAG khusus (Scoped RAG) ke RKA perencanaan OPD yang terikat Surat Tugas ini
      const rkaChunks = await this.prisma.docChunk.findMany({
        where: {
          document: {
            stId: kka.stId,
            type: DocumentType.RKA_PERENCANAAN,
          },
        },
      });

      // Cari rencana yang paling mirip secara semantik di dalam baris perencanaan RKA
      let closestRkaContext = 'Tidak ditemukan dokumen RKA Rencana Anggaran resmi di database.';
      if (rkaChunks.length > 0) {
        // Melakukan cosine similarity pencocokan di memori untuk menemukan kriteria RKA yang terdekat
        const matched = rkaChunks
          .map((chunk) => {
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;
            for (let i = 0; i < queryVector.length; i++) {
              dotProduct += queryVector[i] * chunk.embedding[i];
              normA += queryVector[i] * queryVector[i];
              normB += chunk.embedding[i] * chunk.embedding[i];
            }
            const similarity = normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            return { chunk, similarity };
          })
          .sort((a, b) => b.similarity - a.similarity)[0];

        if (matched && matched.similarity > 0.3) {
          closestRkaContext = `Rencana Anggaran yang Direferensikan:\n${matched.chunk.content}`;
        }
      }

      // 3. Bangun Komparasi Semantik & Deterministik via AI Copilot
      const systemPrompt = `Anda adalah Asisten AI Auditor PBJ di Inspektorat Daerah.
Tugas Anda adalah mendeteksi ketidaksesuaian atau anomali pengadaan barang (mismatch spesifikasi/merk/warna) berdasarkan data perbandingan yang disuplai.
Anda WAJIB memberikan respon dalam format JSON murni mengikuti struktur objek berikut:
{
  "isMismatch": boolean,
  "similarityScore": number, // Skor kemiripan nama barang (0.0 s.d 1.0)
  "specRequired": "nama barang rencana",
  "priceContract": number, // harga satuan rencana
  "volumeContract": number, // volume rencana
  "analisisCopilot": "analisis rinci mengapa barang ini menyimpang (kondisi vs kriteria)"
}`;

      const userPrompt = `
=== BARANG REALISASI (SPJ) ===
- Nama Barang: "${spjItem.itemName}"
- Volume: ${spjItem.volume}
- Harga Satuan: Rp ${spjItem.price.toLocaleString('id-ID')}

=== KONTEKS PERENCANAAN (RKA) ===
${closestRkaContext}

Evaluasi secara objektif:
- Apakah ada perbedaan warna, merk, ukuran atau spesifikasi lainnya?
- Apakah harga realisasi melebihi harga rencana anggaran?
- Berikan analisis tertulis formal audit.`;

      let aiResult: any;
      try {
        const rawAi = await this.llmAdapter.callLlm(systemPrompt, userPrompt, { jsonMode: true, temperature: 0.1 });
        aiResult = JSON.parse(rawAi);
      } catch (err) {
        this.logger.warn(`AI Gagal memproses baris "${spjItem.itemName}", menjalankan fallback deterministik.`);
        aiResult = {
          isMismatch: true,
          similarityScore: 0.5,
          specRequired: 'Tidak Teridentifikasi (Fallback)',
          priceContract: 0.0,
          volumeContract: 0.0,
          analisisCopilot: `[FALLBACK SYSTEM] Terdeteksi ketidaksesuaian deskripsi secara manual pada baris SPJ "${spjItem.itemName}".`,
        };
      }

      // 4. Hitung Deviasi Finansial secara Deterministik (Math Engine)
      const priceContract = Number(aiResult.priceContract || 0);
      const selisihHarga = spjItem.price > priceContract && priceContract > 0
        ? (spjItem.price - priceContract) * spjItem.volume
        : 0.0;

      const status = aiResult.isMismatch || selisihHarga > 0 ? 'ANOMALI' : 'SESUAI';

      // 5. Simpan ke database TrItemAuditPBJ
      const savedItem = await this.prisma.trItemAuditPBJ.create({
        data: {
          kkaId: id,
          itemName: spjItem.itemName,
          specRequired: aiResult.specRequired || null,
          specActual: spjItem.itemName,
          priceContract: priceContract,
          priceActual: spjItem.price,
          volumeContract: Number(aiResult.volumeContract || 0),
          volumeActual: spjItem.volume,
          selisihHarga: selisihHarga,
          analisisCopilot: aiResult.analisisCopilot || null,
          status,
          sumberPembuatan: SumberPembuatan.AI_COPILOT,
        },
      });

      auditResults.push(savedItem);
    }

    this.logger.log(`Evaluasi selesai. Menghasilkan ${auditResults.length} hasil audit PBJ.`);
    return {
      kkaId: id,
      totalProcessed: auditResults.length,
      anomaliesFound: auditResults.filter((r) => r.status === 'ANOMALI').length,
      auditResults,
    };
  }

  /**
   * Mengubah isi KKA (selama belum disetujui / APPROVED).
   */
  async updateKka(id: string, dto: UpdateKkaDto) {
    const kka = await this.findOne(id);

    if (kka.statusKka === 'APPROVED') {
      throw new ConflictException(
        'Kertas Kerja Audit (KKA) sudah disetujui dan tidak dapat diubah.',
      );
    }

    return this.prisma.trKka.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Transisi status KKA (State Machine).
   * Peran dicek dari request.userTeamRole yang diisi oleh ContextualAuthGuard.
   */
  async updateStatus(id: string, newStatus: StatusKka, userTeamRole: string) {
    const kka = await this.findOne(id);

    // Aturan 1: Jika sudah disetujui (APPROVED), status tidak bisa diubah-ubah lagi
    if (kka.statusKka === 'APPROVED') {
      throw new ConflictException('KKA sudah disetujui secara permanen.');
    }

    // Aturan 2: Validasi peran berdasarkan transisi
    if (newStatus === 'APPROVED' || newStatus === 'REVISI') {
      // Hanya Ketua Tim (KT) atau Pimpinan (QC) yang boleh menyetujui / merevisi
      if (userTeamRole !== 'Ketua_Tim') {
        throw new ForbiddenException(
          'Hanya Ketua Tim yang memiliki wewenang untuk menyetujui atau merevisi KKA.',
        );
      }
    }

    if (newStatus === 'MENUNGGU_ULASAN') {
      // Anggota tim mengajukan ke Ketua Tim
      if (kka.statusKka !== 'DRAF' && kka.statusKka !== 'REVISI') {
        throw new ConflictException(
          'Hanya KKA berstatus Draf atau Revisi yang dapat diajukan untuk diulas.',
        );
      }
    }

    return this.prisma.trKka.update({
      where: { id },
      data: { statusKka: newStatus },
    });
  }

  /**
   * Mengambil semua KKA.
   */
  async findAll() {
    return this.prisma.trKka.findMany({
      include: {
        suratTugas: true,
        itemAudits: true, // Sertakan rincian temuan PBJ
      },
    });
  }

  /**
   * Mengambil satu KKA.
   */
  async findOne(id: string) {
    const kka = await this.prisma.trKka.findUnique({
      where: { id },
      include: {
        itemAudits: true, // Sertakan rincian temuan PBJ
        suratTugas: {
          include: {
            stAuditors: {
              include: {
                auditor: true,
              },
            },
          },
        },
      },
    });
    if (!kka) {
      throw new NotFoundException('Kertas Kerja Audit (KKA) tidak ditemukan.');
    }
    return kka;
  }

  /**
   * Menghapus KKA (hanya jika masih DRAF/REVISI).
   */
  async delete(id: string) {
    const kka = await this.findOne(id);
    if (kka.statusKka === 'APPROVED' || kka.statusKka === 'MENUNGGU_ULASAN') {
      throw new ConflictException(
        'KKA yang sedang diulas atau sudah disetujui tidak dapat dihapus.',
      );
    }
    return this.prisma.trKka.delete({ where: { id } });
  }
}