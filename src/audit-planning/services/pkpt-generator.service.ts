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
Tugas Anda adalah menyusun usulan draf program kerja pengawasan tahunan (PKPT) & Agenda Audit untuk OPD-OPD berdasarkan tingkat risiko (NTR), data anggaran/geografis, dan 14 kolom standar format PKPT resmi Inspektorat.
Atribut wajib per agenda meliputi:
- areaPengawasan: Program kerja/bidang yang diawasi
- jenisPengawasan: Audit Tujuan Tertentu, Audit Ketaatan PBJ, Probity Audit, Reviu, Evaluasi, atau Pemantauan
- tujuanSasaran: Poin-poin tujuan pengawasan secara komprehensif
- ruangLingkup: Batasan pemeriksaan (contoh: Belanja Barang Jasa & Modal)
- pelaksana: Unit pelaksana (Irban 1, Irban 2, Irban 3, atau Irban Investigasi)
- jadwal: Triwulan (TW I, TW II, TW III, atau TW IV)
- hariPemeriksaan: Alokasi HP (pj, wkpj, dalnis, kt, at, totalHp)
- jumlahLaporan: Jumlah LHP (1, 2, atau 3)
- saranaPrasarana: Daftar logistik (Laptop, Printer, ATK, Kendaraan Roda 4, Alat Ukur)
- tingkatRisiko: Tinggi, Sedang, atau Rendah
- estimasiAnggaran: 0 jika tidak dicantumkan di anggaran pengawasan langsung

Anda WAJIB mengembalikan output dalam format JSON terstruktur yang mengikuti JSON Schema yang diberikan. Jangan mengarang data di luar konteks. Jangan menambahkan penjelasan teks Markdown di luar objek JSON.`;

    const userPrompt = `Tahun Anggaran: ${tahunAnggaran}
Instruksi Tambahan User: ${instruksiTambahan || 'Tidak ada'}

Berikut adalah Daftar 10 OPD Ter-ranking berdasarkan Nilai Total Risiko (NTR):
${rankingString}

Berikut adalah Regulasi Acuan (Kriteria):
${criteriaText || 'Gunakan pedoman standard audit berbasis risiko Inspektorat.'}

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
    } catch (llmError: any) {
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
Tugas Anda adalah membaca teks/tabel dari dokumen PKPT mentah (Excel/PDF) dan mengekstrak seluruh baris agenda pengawasan secara utuh ke dalam format JSON 14 kolom standar PKPT.
SANGAT PENTING: Anda WAJIB mencocokkan (Fuzzy Match) nama instansi/OPD di dokumen mentah dengan DAFTAR OPD RESMI yang diberikan.
Anda HANYA BOLEH menggunakan 'opdId' dan 'opdName' yang terdapat di dalam daftar resmi tersebut. Jika tidak yakin, pilih yang ejaannya paling mirip.
Untuk setiap baris, ekstrak:
- areaPengawasan: Area Pengawasan / Program
- jenisPengawasan: Audit Tujuan Tertentu, Audit Ketaatan PBJ, Probity Audit, Reviu, Evaluasi, dll.
- tujuanSasaran: Seluruh poin tujuan sasaran yang tertulis
- ruangLingkup: Ruang lingkup pemeriksaan
- pelaksana: Irban 1 / Irban 2 / Irban 3 / Irban Investigasi
- jadwal: TW I / TW II / TW III / TW IV
- perkiraanBulan: Konversi dari TW (TW I=2, TW II=5, TW III=8, TW IV=11)
- hariPemeriksaan: Matriks HP (pj, wkpj, dalnis, kt, at, totalHp)
- jumlahLaporan: Angka dari kolom JUM LAP (default 1 jika kosong)
- saranaPrasarana: Array teks sarana prasarana yang tercantum (contoh: ["Laptop", "Printer", "Kertas", "Kendaraan Roda 4"])
- tingkatRisiko: Tinggi / Sedang / Rendah
- estimasiAnggaran: 0 jika kolom anggaran kosong

Anda WAJIB mengembalikan output dalam format JSON terstruktur. Jangan tambahkan Markdown.`;

    const userPrompt = `Tahun Anggaran: ${tahunAnggaran}

=== DAFTAR OPD RESMI (GUNAKAN INI UNTUK REFERENSI opdId DAN opdName) ===
${opdReference}

=== ISI DOKUMEN PKPT MENTAH YANG DIUNGGAH ===
${extractedText}

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
    } catch (llmError: any) {
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
          await tx.trAgendaAudit.deleteMany({
            where: { pkptId: pkpt.id },
          });
          pkpt = await tx.trPkpt.update({
            where: { id: pkpt.id },
            data: {
              statusPkpt: 'DISETUJUI',
              sumberPembuatan,
            },
          });
        } else {
          pkpt = await tx.trPkpt.create({
            data: {
              tahunAnggaran,
              statusPkpt: 'DISETUJUI',
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
              jenisPengawasan: item.jenisPengawasan || 'Audit',
              perkiraanBulan: item.perkiraanBulan || 2,
              estimasiAnggaran: item.estimasiAnggaran || 0,
              sumberPembuatan,
              substansiDokumen: {
                areaPengawasan: item.areaPengawasan || 'Program Kerja OPD',
                tujuanSasaran: item.tujuanSasaran || 'Pemeriksaan kepatuhan dan akuntabilitas pelaksanaan program.',
                ruangLingkup: item.ruangLingkup || 'Belanja Barang/Jasa & Modal',
                pelaksana: item.pelaksana || 'Irban 1',
                jadwal: item.jadwal || 'TW I',
                hariPemeriksaan: item.hariPemeriksaan || { pj: 1, wkpj: 1, dalnis: 10, kt: 15, at: 30, totalHp: 57 },
                jumlahLaporan: item.jumlahLaporan || 1,
                saranaPrasarana: item.saranaPrasarana || ['Laptop', 'Printer', 'ATK'],
                tingkatRisiko: item.tingkatRisiko || 'Tinggi',
                keterangan: item.keterangan || '',
                alasanPrioritas: item.alasanPrioritas || 'Hasil ekstraksi PKPT resmi berbasis risiko.',
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
    } catch (parseError: any) {
      this.logger.error(`Gagal mem-parsing atau menyimpan draf usulan PKPT: ${parseError.message}`);
      throw new InternalServerErrorException(`Gagal menyusun draf PKPT: ${parseError.message}`);
    }
  }

  private getFallbackDraft(rankings: any[], tahun: number) {
    this.logger.warn('Menghasilkan draf fallback terstruktur untuk PKPT karena server LLM offline.');
    
    // Menggunakan data realistis dari referensi PKPT 2025 resmi
    const referenceTemplates = [
      {
        areaPengawasan: 'Program Pencegahan, Penanggulangan, Penyelamatan Kebakaran',
        jenisPengawasan: 'Audit Tujuan Tertentu Kegiatan Bantuan Keuangan',
        tujuanSasaran: '1. Pelaksanaan kegiatan sesuai aturan dan ketentuan\n2. Prosedur PBJ terpenuhi\n3. Mutu barang/jasa dapat dipertanggungjawabkan\n4. Pembayaran kegiatan sesuai progres pemeriksaan',
        ruangLingkup: 'Kegiatan Belanja Barang Jasa dan Belanja Modal T.A. 2024',
        pelaksana: 'Irban 1',
        jadwal: 'TW I',
        bulan: 2,
        hariPemeriksaan: { pj: 1, wkpj: 1, dalnis: 10, kt: 10, at: 30, totalHp: 52 },
        jumlahLaporan: 1,
        saranaPrasarana: ['Laptop', 'Printer', 'Kertas', 'Kendaraan Roda 4'],
        tingkatRisiko: 'Tinggi',
      },
      {
        areaPengawasan: 'Program Pengendalian Pencemaran dan Pengelolaan Persampahan',
        jenisPengawasan: 'Audit Tujuan Tertentu Kegiatan Bantuan Keuangan',
        tujuanSasaran: '1. Kepatuhan regulasi bantuan keuangan daerah\n2. Evaluasi kewajaran harga pengadaan sarana persampahan\n3. Verifikasi fisik lapangan sarana prasarana',
        ruangLingkup: 'Belanja Operasional & Modal Persampahan',
        pelaksana: 'Irban 1',
        jadwal: 'TW I',
        bulan: 3,
        hariPemeriksaan: { pj: 1, wkpj: 1, dalnis: 10, kt: 10, at: 60, totalHp: 82 },
        jumlahLaporan: 1,
        saranaPrasarana: ['Laptop', 'Printer', 'Kertas', 'Kendaraan Roda 4', 'Alat Ukur'],
        tingkatRisiko: 'Tinggi',
      },
      {
        areaPengawasan: 'Program Penyelenggaraan Jalan dan Jaringan Irigasi',
        jenisPengawasan: 'Audit Ketaatan Pengadaan Barang dan Jasa (MCP-KPK 2025)',
        tujuanSasaran: 'Memperoleh keyakinan memadai atas kewajaran harga dan kepatuhan spesifikasi teknis pekerjaan konstruksi fisik',
        ruangLingkup: 'Perencanaan s.d Pelaksanaan Konstruksi Jalan T.A. 2024',
        pelaksana: 'Irban 2',
        jadwal: 'TW II',
        bulan: 5,
        hariPemeriksaan: { pj: 1, wkpj: 1, dalnis: 15, kt: 45, at: 180, totalHp: 242 },
        jumlahLaporan: 3,
        saranaPrasarana: ['Kendaraan Roda 4', 'Laptop', 'ATK', 'Printer', 'Alat Ukur'],
        tingkatRisiko: 'Tinggi',
      },
      {
        areaPengawasan: 'Program Pengelolaan Pendidikan dan Bantuan Operasional Sekolah',
        jenisPengawasan: 'Audit Tujuan Tertentu Dana BOS & Sarpras Pendidikan',
        tujuanSasaran: '1. Verifikasi ketepatan sasaran dana BOS\n2. Pengawasan pengadaan mebelair dan rehabilitasi gedung sekolah',
        ruangLingkup: 'Belanja Hibah BOS dan Belanja Modal Sekolah',
        pelaksana: 'Irban 3',
        jadwal: 'TW II',
        bulan: 6,
        hariPemeriksaan: { pj: 1, wkpj: 1, dalnis: 10, kt: 20, at: 100, totalHp: 132 },
        jumlahLaporan: 1,
        saranaPrasarana: ['Laptop', 'Printer', 'Kertas', 'Kendaraan Roda 4'],
        tingkatRisiko: 'Tinggi',
      },
      {
        areaPengawasan: 'Program Sediaan Farmasi, Alat Kesehatan dan Pelayanan Medik',
        jenisPengawasan: 'Probity Audit Pengadaan Alkes & Obat-obatan (MCP-KPK)',
        tujuanSasaran: 'Memastikan proses pemilihan penyedia alkes dan obat berlangsung transparan, adil, dan bebas benturan kepentingan',
        ruangLingkup: 'Tahap Perencanaan s.d Kontrak PBJ Alkes',
        pelaksana: 'Irban Investigasi',
        jadwal: 'TW III',
        bulan: 8,
        hariPemeriksaan: { pj: 1, wkpj: 1, dalnis: 20, kt: 20, at: 80, totalHp: 122 },
        jumlahLaporan: 1,
        saranaPrasarana: ['Laptop', 'Printer', 'ATK', 'Kendaraan Roda 4'],
        tingkatRisiko: 'Tinggi',
      },
    ];

    const agendaItems = rankings.slice(0, 5).map((r, idx) => {
      const template = referenceTemplates[idx % referenceTemplates.length];
      return {
        opdId: r.opdId,
        opdName: r.opd.namaOpd,
        areaPengawasan: template.areaPengawasan,
        jenisPengawasan: template.jenisPengawasan,
        tujuanSasaran: template.tujuanSasaran,
        ruangLingkup: template.ruangLingkup,
        pelaksana: template.pelaksana,
        jadwal: template.jadwal,
        perkiraanBulan: template.bulan,
        estimasiAnggaran: 0, // Sesuai dokumen resmi (blank/0)
        hariPemeriksaan: template.hariPemeriksaan,
        jumlahLaporan: template.jumlahLaporan,
        saranaPrasarana: template.saranaPrasarana,
        tingkatRisiko: template.tingkatRisiko,
        keterangan: 'Prioritas Audit Pengawasan Berbasis Risiko',
        alasanPrioritas: `Diprioritaskan berdasarkan skor risiko NTR ${r.ntr} (NRI: ${r.nri}, NFR: ${r.nfr}) untuk tahun ${tahun}.`,
      };
    });

    return { agendaItems };
  }
}