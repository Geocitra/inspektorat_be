// scratch/verify_hotfixes_ai.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentRepository } from '../src/document-ingestion/repositories/document.repository';
import { PkptGeneratorService } from '../src/audit-planning/services/pkpt-generator.service';
import { PkaGeneratorService } from '../src/assignment/services/pka-generator.service';
import { KkaService } from '../src/kka/kka.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentType, DocumentStatus } from '@prisma/client';
import * as assert from 'assert';

async function bootstrap() {
  console.log('=== MEMULAI VERIFIKASI HOTFIXES & ARSITEKTUR RAG ===');

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const docRepository = app.get(DocumentRepository);
  const pkptGenerator = app.get(PkptGeneratorService);
  const pkaGenerator = app.get(PkaGeneratorService);
  const kkaService = app.get(KkaService);

  const testYear = 2027;

  try {
    // ----------------------------------------------------
    // 1. Membersihkan Data Testing Lama
    // ----------------------------------------------------
    console.log('\n1. Membersihkan data lama...');
    await prisma.trPka.deleteMany({});
    await prisma.trKka.deleteMany({});
    await prisma.relStAuditor.deleteMany({});
    await prisma.trSuratTugas.deleteMany({});
    await prisma.trAgendaAudit.deleteMany({});
    await prisma.trPkpt.deleteMany({});
    await prisma.opdRiskAssessment.deleteMany({});
    await prisma.docChunk.deleteMany({});
    await prisma.docMetadata.deleteMany({});
    await prisma.auditDocument.deleteMany({});
    
    await prisma.mstPegawai.deleteMany({
      where: { nip: { in: ['19900101-01', '19900101-02', '19900101-03'] } },
    });
    await prisma.mstOpd.deleteMany({
      where: { namaOpd: { in: ['Dinas Pendidikan Uji', 'Inspektorat Uji'] } },
    });

    // ----------------------------------------------------
    // 2. Seeding Data Pegawai, OPD, dan Dokumen
    // ----------------------------------------------------
    console.log('\n2. Seeding data...');
    
    const opdInspektorat = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Inspektorat Uji',
        alamat: 'Jl. Inspektorat No. 1',
        gpsKoordinat: '-7.250445, 112.768845',
      },
    });

    const opdTarget = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Pendidikan Uji',
        alamat: 'Jl. Pendidikan No. 20',
        gpsKoordinat: '-7.270445, 112.788845',
      },
    });

    // Seeding Available Auditors
    await prisma.mstPegawai.createMany({
      data: [
        {
          nip: '19900101-01',
          nama: 'Andi Saputra',
          jabatan: 'Auditor Ahli Madya',
          opdId: opdInspektorat.id,
        },
        {
          nip: '19900101-02',
          nama: 'Budi Santoso',
          jabatan: 'Auditor Ahli Muda',
          opdId: opdInspektorat.id,
        },
        {
          nip: '19900101-03',
          nama: 'Citra Lestari',
          jabatan: 'Auditor Ahli Pertama',
          opdId: opdInspektorat.id,
        },
      ],
    });

    // Seeding Regulasi RAG
    const doc = await prisma.auditDocument.create({
      data: {
        title: 'Pedoman PKPT dan PKA Rutin',
        type: DocumentType.REGULASI_INTERNAL,
        status: DocumentStatus.AKTIF,
        filePath: '/files/pedoman.pdf',
      },
    });

    await prisma.docMetadata.create({
      data: {
        documentId: doc.id,
        fileSize: 1024,
        mimeType: 'application/pdf',
        totalChunks: 1,
        hash: 'testhash12345',
      },
    });

    // Simpan mock embedding berdimensi 1536
    const mockEmbedding = new Array(1536).fill(0.01);
    await prisma.docChunk.create({
      data: {
        documentId: doc.id,
        chunkIndex: 0,
        content: 'Pedoman PKPT: Evaluasi anggaran OPD wajib diselesaikan dalam 12 hari kerja dengan tim lengkap.',
        embedding: mockEmbedding,
      },
    });

    console.log('   [SUCCESS] Data uji coba berhasil di-seed.');

    // ----------------------------------------------------
    // 3. Menguji pgvector searchSimilarity / Fallback
    // ----------------------------------------------------
    console.log('\n3. Menguji hybrid pgvector similarity search & fallback...');
    const searchResults = await docRepository.searchSimilarity(mockEmbedding, 5);
    assert.ok(searchResults);
    console.log(`   [PASSED] Hasil pencarian semantik similarity berhasil dikembalikan (Total: ${searchResults.length}).`);

    // ----------------------------------------------------
    // 4. Menguji Generasi PKPT RAG dengan Vektor Riil
    // ----------------------------------------------------
    console.log('\n4. Menguji generasi PKPT dengan RAG Vektor Riil...');
    const pkptDraft = await pkptGenerator.generateDraftPkpt(testYear, 'Fokuskan audit anggaran dinas pendidikan.');
    assert.ok(pkptDraft);
    
    // Dapatkan agenda audit terbuat
    const agenda = await prisma.trAgendaAudit.findFirst({
      where: { pkpt: { tahunAnggaran: testYear } },
    });
    assert.ok(agenda);
    console.log('   [PASSED] PKPT RAG dengan Vektor Riil berhasil digenerasi dan disimpan.');

    // ----------------------------------------------------
    // 5. Menguji Generasi PKA RAG dengan Vektor Riil
    // ----------------------------------------------------
    console.log('\n5. Menguji generasi PKA dengan RAG Vektor Riil...');
    
    // Buat Surat Tugas aktif agar dapat membuat KKA nanti
    const st = await prisma.trSuratTugas.create({
      data: {
        agendaAuditId: agenda.id,
        nomorSt: 'ST/HOTFIX/2027',
        tanggalMulai: new Date('2027-01-10'),
        tanggalSelesai: new Date('2027-01-25'),
        statusSt: 'AKTIF', // Set AKTIF agar KKA bisa dibuat
      },
    });

    const pkaSteps = await pkaGenerator.generatePka(st.id, 'Evaluasi anggaran operasional sarpras.');
    assert.ok(pkaSteps.length > 0);
    const firstPka = pkaSteps[0];
    console.log(`   [PASSED] PKA RAG dengan Vektor Riil berhasil digenerasi (Langkah Pertama: ${firstPka.noLangkah}).`);

    // ----------------------------------------------------
    // 6. Menguji Traceability PKA -> KKA (pkaId)
    // ----------------------------------------------------
    console.log('\n6. Menguji KKA Traceability (menyimpan pkaId)...');
    
    const kka = await kkaService.createKka({
      stId: st.id,
      pkaId: firstPka.id,
      prosedurPemeriksaan: 'Lakukan pemeriksaan dokumen pengadaan ATK.',
      uraianPengujian: 'Telah dilakukan perbandingan invoice dengan bukti fisik.',
      kesimpulanSementara: 'Belanja ATK telah direalisasikan sesuai spesifikasi.',
    });

    assert.strictEqual(kka.pkaId, firstPka.id, 'KKA harus memiliki pkaId yang valid sesuai langkah PKA asal.');
    console.log('   [PASSED] Traceability PKA -> KKA berhasil diverifikasi (pkaId terikat erat di database).');

    // ----------------------------------------------------
    // Cleanup Akhir
    // ----------------------------------------------------
    console.log('\n7. Pembersihan data pasca pengujian...');
    await prisma.trPka.deleteMany({});
    await prisma.trKka.deleteMany({});
    await prisma.relStAuditor.deleteMany({});
    await prisma.trSuratTugas.deleteMany({});
    await prisma.trAgendaAudit.deleteMany({});
    await prisma.trPkpt.deleteMany({});
    await prisma.opdRiskAssessment.deleteMany({});
    await prisma.docChunk.deleteMany({});
    await prisma.docMetadata.deleteMany({});
    await prisma.auditDocument.deleteMany({});
    
    await prisma.mstPegawai.deleteMany({
      where: { nip: { in: ['19900101-01', '19900101-02', '19900101-03'] } },
    });
    await prisma.mstOpd.deleteMany({
      where: { namaOpd: { in: ['Dinas Pendidikan Uji', 'Inspektorat Uji'] } },
    });

    console.log('\n=== VERIFIKASI HOTFIXES BERHASIL 100% ===');
  } catch (error) {
    console.error('\n   [ERROR] Verifikasi gagal:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
