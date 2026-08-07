// scratch/verify_phase_1_ai.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentIngestionService } from '../src/document-ingestion/services/document-ingestion.service';
import { DocumentRepository } from '../src/document-ingestion/repositories/document.repository';
import { FileSignatureValidationPipe } from '../src/common/pipes/file-signature-validation.pipe';
import { DocumentType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import * as assert from 'assert';

async function bootstrap() {
  console.log('=== MEMULAI VERIFIKASI FASE 1 (RAG KNOWLEDGE BASE) ===');

  const app = await NestFactory.createApplicationContext(AppModule);
  const ingestionService = app.get(DocumentIngestionService);
  const documentRepository = app.get(DocumentRepository);
  const validationPipe = new FileSignatureValidationPipe();

  try {
    // ----------------------------------------------------
    // 1. UJI COBA VALIDATION PIPE (MAGIC NUMBERS)
    // ----------------------------------------------------
    console.log('\n1. Menguji FileSignatureValidationPipe...');

    // A. PDF valid (magic numbers %PDF = [0x25, 0x50, 0x44, 0x46])
    const validPdfFile = {
      buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x31, 0x2e, 0x34, 0x0a]),
      originalname: 'test_regulasi.pdf',
      mimetype: 'application/pdf',
    };
    const validatedPdf = validationPipe.transform(validPdfFile);
    assert.deepStrictEqual(validatedPdf, validPdfFile);
    console.log('   [PASSED] PDF valid berhasil divalidasi.');

    // B. PDF palsu (ekstensi .pdf tapi isi biner tidak mengandung %PDF)
    const fakePdfFile = {
      buffer: Buffer.from('INI_BUKAN_PDF_TAPI_TEKS_BIASA'),
      originalname: 'fake_regulasi.pdf',
      mimetype: 'application/pdf',
    };
    assert.throws(
      () => validationPipe.transform(fakePdfFile),
      (err: any) => err instanceof BadRequestException && err.message.includes('Tipe berkas biner tidak cocok dengan ekstensinya'),
      '   [FAILED] Seharusnya menolak PDF dengan magic numbers tidak cocok.'
    );
    console.log('   [PASSED] PDF palsu berhasil ditolak.');

    // C. DOCX valid (magic numbers PK.. = [0x50, 0x4B, 0x03, 0x04])
    const validDocxFile = {
      buffer: Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x08, 0x00]),
      originalname: 'surat_tugas.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const validatedDocx = validationPipe.transform(validDocxFile);
    assert.deepStrictEqual(validatedDocx, validDocxFile);
    console.log('   [PASSED] DOCX valid berhasil divalidasi.');

    // D. TXT valid
    const validTxtFile = {
      buffer: Buffer.from('Pedoman Audit Inspektorat Daerah Kota Bekasi. Aturan PBJ wajib dipatuhi.'),
      originalname: 'pedoman.txt',
      mimetype: 'text/plain',
    };
    const validatedTxt = validationPipe.transform(validTxtFile);
    assert.deepStrictEqual(validatedTxt, validTxtFile);
    console.log('   [PASSED] TXT valid berhasil divalidasi.');

    // E. TXT palsu (mengandung null byte biner)
    const fakeTxtFile = {
      buffer: Buffer.from('Pedoman Audit\x00Bin\x01\x02'),
      originalname: 'fake_pedoman.txt',
      mimetype: 'text/plain',
    };
    assert.throws(
      () => validationPipe.transform(fakeTxtFile),
      (err: any) => err instanceof BadRequestException && err.message.includes('terdeteksi mengandung biner/null byte'),
      '   [FAILED] Seharusnya menolak TXT dengan null byte.'
    );
    console.log('   [PASSED] TXT palsu (biner null byte) berhasil ditolak.');

    // ----------------------------------------------------
    // 2. UJI COBA INGESTI DOKUMEN (RAG PIPELINE)
    // ----------------------------------------------------
    console.log('\n2. Menguji Ingesti Dokumen Regulasi (TXT)...');

    // Buat file plain text untuk testing
    const textContent = 
      'BAB I: KETENTUAN UMUM\n\n' +
      'Pasal 1\n' +
      'Dalam Peraturan Daerah ini yang dimaksud dengan:\n' +
      '1. Inspektorat adalah Inspektorat Daerah Kota Bekasi.\n' +
      '2. Pengawasan Intern adalah seluruh proses kegiatan audit, reviu, evaluasi, pemantauan, dan kegiatan pengawasan lainnya.\n\n' +
      'BAB II: TATA CARA PENGAWASAN\n\n' +
      'Pasal 2\n' +
      'Pengawasan intern dilakukan berbasis risiko dengan mengidentifikasi Nilai Total Risiko (NTR) masing-masing Perangkat Daerah (OPD).\n' +
      'Inspektorat berhak melakukan audit ketaatan pengadaan barang dan jasa untuk mencegah terjadinya anomali spesifikasi barang.';

    const mockTxtUpload = {
      buffer: Buffer.from(textContent),
      originalname: 'perda_bekasi_2026.txt',
      mimetype: 'text/plain',
    };

    // Bersihkan data testing lama jika ada
    const db = (documentRepository as any).prisma;
    await db.docChunk.deleteMany({
      where: {
        document: {
          title: 'Peraturan Daerah Bekasi 2026',
        },
      },
    });
    await db.auditDocument.deleteMany({
      where: {
        title: 'Peraturan Daerah Bekasi 2026',
      },
    });

    // Jalankan ingesti dokumen
    const docResult = await ingestionService.ingestDocument(
      mockTxtUpload,
      DocumentType.REGULASI_DAERAH,
      'Peraturan Daerah Bekasi 2026',
    );

    assert.ok(docResult.id);
    assert.strictEqual(docResult.title, 'Peraturan Daerah Bekasi 2026');
    assert.strictEqual(docResult.type, DocumentType.REGULASI_DAERAH);
    console.log(`   [PASSED] Dokumen berhasil di-ingest. ID: ${docResult.id}`);

    // Verifikasi database record metadata & chunks
    const savedMeta = await db.docMetadata.findUnique({
      where: { documentId: docResult.id },
    });
    assert.ok(savedMeta);
    assert.strictEqual(savedMeta.mimeType, 'text/plain');
    assert.ok(savedMeta.totalChunks > 0);
    console.log(`   [PASSED] Metadata berhasil diverifikasi. Total Chunks: ${savedMeta.totalChunks}`);

    const savedChunks = await db.docChunk.findMany({
      where: { documentId: docResult.id },
    });
    assert.strictEqual(savedChunks.length, savedMeta.totalChunks);
    assert.ok(savedChunks[0].content.length > 0);
    assert.strictEqual(savedChunks[0].embedding.length, 1536);
    console.log('   [PASSED] Pecahan chunks & vektor embedding 1536-dimensi berhasil diverifikasi di database.');

    // ----------------------------------------------------
    // 3. UJI COBA SEARCH SEMANTIK & FALLBACK KEYWORD
    // ----------------------------------------------------
    console.log('\n3. Menguji Pencarian Semantik & Keyword Fallback...');

    // A. Uji pencarian semantik (memicu Cosine Similarity)
    const searchResults = await ingestionService.searchDocuments('Pengawasan intern berbasis risiko', 2);
    assert.ok(searchResults.length > 0);
    assert.ok(searchResults[0].similarity !== undefined && !isNaN(searchResults[0].similarity));
    console.log(`   [PASSED] Pencarian semantik sukses. Hasil teratas: "${searchResults[0].content.substring(0, 60)}..." (Score: ${searchResults[0].similarity})`);

    // B. Uji pencarian kata kunci fallback
    const keywordResults = await documentRepository.searchKeyword('Bekasi', 2);
    assert.ok(keywordResults.length > 0);
    assert.ok(keywordResults[0].content.toLowerCase().includes('bekasi'));
    console.log(`   [PASSED] Fallback pencarian kata kunci sukses. Hasil: "${keywordResults[0].content.substring(0, 60)}..."`);

    console.log('\n=== VERIFIKASI FASE 1 BERHASIL 100% ===');
  } catch (error) {
    console.error('\n   [ERROR] Verifikasi gagal:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
