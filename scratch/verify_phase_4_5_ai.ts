// scratch/verify_phase_4_5_ai.ts
// Mock pdf-parse before Nest AppModule is loaded
require.cache[require.resolve('pdf-parse')] = {
  id: require.resolve('pdf-parse'),
  filename: require.resolve('pdf-parse'),
  loaded: true,
  path: '',
  paths: [],
  children: [],
  exports: async function(buffer: any) {
    return {
      text: 'Adendum Kontrak Nomor 12/ADD/2027 tanggal 15 Januari 2027: Dikarenakan kelangkaan stok pasar untuk kertas merk Standard, disetujui perubahan merk ke Sinar Dunia dengan harga penyesuaian Rp 60.000.',
    };
  },
} as any;

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VendorLlmAdapter } from '../src/common/ai/vendor-llm.adapter';
import { KkaService } from '../src/kka/kka.service';
import { NhpGeneratorService } from '../src/lhp/services/nhp-generator.service';
import { FeedbackAnalyzerService } from '../src/lhp/services/feedback-analyzer.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentType, DocumentStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as assert from 'assert';

async function bootstrap() {
  console.log('=== MEMULAI VERIFIKASI INTEGRASI FASE 4 & 5 ===');

  const app = await NestFactory.createApplicationContext(AppModule);
  
  // Stub VendorLlmAdapter directly on the resolved singleton instance
  const llmAdapter = app.get(VendorLlmAdapter);
  llmAdapter.callLlm = async (system: string, user: string, options?: any) => {
    // Check feedback analyzer first to avoid partial string matching conflict
    if (user.includes('SURAT JAWABAN/JUSTIFIKASI OPD') || user.includes('TANGGAPAN OPD') || user.includes('KONDISI PEMBELAAN')) {
      return JSON.stringify({
        isJustificationValid: true,
        rekomendasiStatus: 'TUNTAS',
        confidenceScore: 0.95,
        analisisKepatuhan: 'Justifikasi adendum sah karena keadaan darurat / kelangkaan pasar.',
      });
    }
    if (user.includes('BARANG REALISASI')) {
      return JSON.stringify({
        isMismatch: false,
        similarityScore: 0.9,
        specRequired: 'Kertas HVS A4 80gr Sinar Dunia',
        priceContract: 50000,
        volumeContract: 100,
        analisisCopilot: 'Realisasi sesuai dengan RKA namun terdapat selisih harga dari perencanaan.',
      });
    }
    if (user.includes('DAFTAR ANOMALI PBJ')) {
      return JSON.stringify({
        temuanUtama: [
          {
            judulTemuan: 'Kelebihan Pembayaran Atas Kertas HVS A4 80gr Sinar Dunia',
            kondisi: 'Ditemukan pembelian Kertas HVS A4 80gr Sinar Dunia dengan harga satuan Rp 60.000, melebihi harga rencana Rp 50.000.',
            kriteria: 'Harga rencana belanja adalah Rp 50.000.',
            sebab: 'PPK kurang cermat.',
            akibat: 'Kerugian daerah Rp 100.000.',
            rekomendasi: 'Setorkan kembali ke Kas Daerah.',
          },
        ],
      });
    }
    return '{}';
  };

  const prisma = app.get(PrismaService);
  const kkaService = app.get(KkaService);
  const nhpGenerator = app.get(NhpGeneratorService);
  const feedbackAnalyzer = app.get(FeedbackAnalyzerService);

  try {
    // 1. Bersihkan Data Lama
    console.log('\n1. Membersihkan data lama...');
    await prisma.trPka.deleteMany({});
    await prisma.trKka.deleteMany({});
    await prisma.trItemAuditPBJ.deleteMany({});
    await prisma.trLhp.deleteMany({});
    await prisma.relStAuditor.deleteMany({});
    await prisma.trSuratTugas.deleteMany({});
    await prisma.trAgendaAudit.deleteMany({});
    await prisma.trPkpt.deleteMany({});
    await prisma.opdRiskAssessment.deleteMany({});
    await prisma.docChunk.deleteMany({});
    await prisma.docMetadata.deleteMany({});
    await prisma.auditDocument.deleteMany({});
    await prisma.mstOpd.deleteMany({ where: { namaOpd: 'Dinas Kesehatan Uji' } });

    // 2. Seed OPD & Surat Tugas
    console.log('\n2. Seeding OPD dan Surat Tugas...');
    const opd = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Kesehatan Uji',
        alamat: 'Jl. Kesehatan No. 5',
        gpsKoordinat: '-7.260000, 112.770000',
      },
    });

    const pkpt = await prisma.trPkpt.create({
      data: {
        tahunAnggaran: 2027,
        statusPkpt: 'DISETUJUI',
      },
    });

    const agenda = await prisma.trAgendaAudit.create({
      data: {
        pkptId: pkpt.id,
        opdId: opd.id,
        jenisPengawasan: 'Audit',
        perkiraanBulan: 2,
        estimasiAnggaran: 20000000,
      },
    });

    const st = await prisma.trSuratTugas.create({
      data: {
        agendaAuditId: agenda.id,
        nomorSt: 'ST/PBJ-NHP/2027',
        tanggalMulai: new Date('2027-02-10'),
        tanggalSelesai: new Date('2027-02-25'),
        statusSt: 'AKTIF',
      },
    });

    // 3. Seed Dokumen RKA Perencanaan Scoped RAG
    console.log('\n3. Seeding RKA Perencanaan Scoped...');
    const rkaDoc = await prisma.auditDocument.create({
      data: {
        title: 'RKA Perencanaan Dinas Kesehatan 2027',
        type: DocumentType.RKA_PERENCANAAN,
        status: DocumentStatus.AKTIF,
        filePath: '/files/rka-health.pdf',
        stId: st.id,
      },
    });

    await prisma.docChunk.create({
      data: {
        documentId: rkaDoc.id,
        chunkIndex: 0,
        content: 'Rencana Belanja DPA Dinas Kesehatan: Kertas HVS A4 80gr Sinar Dunia sebanyak 100 rim dengan harga satuan rencana Rp 50.000.',
        embedding: new Array(1536).fill(0.02),
      },
    });

    // 4. Seed Regulasi SSH Global RAG
    console.log('\n4. Seeding Regulasi SSH Global...');
    const sshDoc = await prisma.auditDocument.create({
      data: {
        title: 'Aturan Standard Satuan Harga SSH 2027',
        type: DocumentType.REGULASI_DAERAH,
        status: DocumentStatus.AKTIF,
        filePath: '/files/ssh-2027.pdf',
      },
    });

    await prisma.docChunk.create({
      data: {
        documentId: sshDoc.id,
        chunkIndex: 0,
        content: 'Batas SSH Regional: Kertas HVS A4 80gr dipatok maksimal Rp 55.000 per rim.',
        embedding: new Array(1536).fill(0.02),
      },
    });

    // 5. Generate Excel SPJ Realisasi
    console.log('\n5. Generate Mock Excel SPJ Kuitansi...');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('SPJ');
    sheet.getRow(1).values = ['Nama Barang', 'Kuantitas', 'Harga Satuan', 'Total'];
    sheet.getRow(2).values = ['Kertas HVS A4 80gr Sinar Dunia', 10, 60000, 600000]; // Ada mark-up/selisih harga dari RKA (50k)
    const excelBuffer = await workbook.xlsx.writeBuffer();

    // 6. Buat KKA Draf untuk menampung Audit PBJ
    console.log('\n6. Menjalankan auditPbj (Fase 4)...');
    const kka = await kkaService.createKka({
      stId: st.id,
      prosedurPemeriksaan: 'Lakukan pencocokan kuitansi dengan RKA/SSH.',
      uraianPengujian: 'Telah dibandingkan realisasi dengan dokumen perencanaan.',
      kesimpulanSementara: 'Perlu pengujian lanjutan atas deviasi harga.',
    });

    const auditPbjResult = await kkaService.auditPbj(
      kka.id,
      { buffer: excelBuffer, originalname: 'mock-spj.xlsx' },
      { spjSheetName: 'SPJ', rkaSheetName: 'RKA', rowStart: 2 }
    );

    assert.strictEqual(auditPbjResult.totalProcessed, 1);
    assert.strictEqual(auditPbjResult.anomaliesFound, 1);
    const pbjItem = auditPbjResult.auditResults[0];
    assert.strictEqual(pbjItem.status, 'ANOMALI');
    // Selisih harga: (60.000 - 50.000) * 10 = 100.000
    assert.strictEqual(Number(pbjItem.selisihHarga), 100000);
    console.log('   [PASSED] Audit PBJ berhasil mendeteksi anomali harga dan menghitung deviasi finansial secara tepat.');

    // Set KKA ke APPROVED agar NHP dapat disusun
    await prisma.trKka.update({
      where: { id: kka.id },
      data: { statusKka: 'APPROVED' },
    });

    // 7. Uji Susun NHP (Fase 5)
    console.log('\n7. Menjalankan generateNhp (Fase 5)...');
    const nhpResult = await nhpGenerator.generateNhp(st.id);
    assert.ok(nhpResult.temuanUtama);
    
    // Periksa apakah draf NHP tersimpan di DB
    const lhp = await prisma.trLhp.findFirst({
      where: { stId: st.id },
    });
    assert.ok(lhp);
    assert.ok(lhp.substansiNhp);
    console.log('   [PASSED] Draf NHP berhasil disusun dan disimpan sebagai draf LHP awal.');

    // 8. Uji Evaluasi Tanggapan OPD (Fase 5)
    console.log('\n8. Menjalankan evaluateFeedback (Fase 5)...');
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock...');
    const feedbackResult = await feedbackAnalyzer.analyzeFeedback(
      lhp.id,
      { buffer: mockPdfBuffer }
    );
    assert.ok(feedbackResult.rekomendasiStatus);
    console.log(`   [PASSED] Analisis kelayakan justifikasi OPD selesai dengan keputusan: ${feedbackResult.rekomendasiStatus}`);

    // Clean up
    console.log('\n9. Pembersihan data pasca pengujian...');
    await prisma.trPka.deleteMany({});
    await prisma.trKka.deleteMany({});
    await prisma.trItemAuditPBJ.deleteMany({});
    await prisma.trLhp.deleteMany({});
    await prisma.relStAuditor.deleteMany({});
    await prisma.trSuratTugas.deleteMany({});
    await prisma.trAgendaAudit.deleteMany({});
    await prisma.trPkpt.deleteMany({});
    await prisma.opdRiskAssessment.deleteMany({});
    await prisma.docChunk.deleteMany({});
    await prisma.docMetadata.deleteMany({});
    await prisma.auditDocument.deleteMany({});
    await prisma.mstOpd.deleteMany({ where: { namaOpd: 'Dinas Kesehatan Uji' } });

    console.log('\n=== VERIFIKASI INTEGRASI FASE 4 & 5 SUKSES 100% ===');
  } catch (error) {
    console.error('\n   [ERROR] Verifikasi gagal:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
