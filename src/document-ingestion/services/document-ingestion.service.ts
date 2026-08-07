// src/document-ingestion/services/document-ingestion.service.ts
import { Injectable, Logger, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { ParserFactory } from '../parsers/parser.factory';
import { TextSanitizerPipeline } from '../utils/sanitizers/text-sanitizer.pipeline';
import { SemanticChunkerService } from './semantic-chunker.service';
import { EmbeddingBatchProcessor } from '../utils/embedding-batch-processor.util';
import { ExternalEmbeddingAdapter } from '../providers/external-embedding.adapter';
import { DocumentType } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger(DocumentIngestionService.name);
  private readonly storageDir = path.join(process.cwd(), 'storage', 'documents');

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly parserFactory: ParserFactory,
    private readonly sanitizerPipeline: TextSanitizerPipeline,
    private readonly chunkerService: SemanticChunkerService,
    private readonly batchProcessor: EmbeddingBatchProcessor,
    private readonly embeddingAdapter: ExternalEmbeddingAdapter,
  ) {
    // Pastikan folder penyimpanan lokal terbentuk
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  /**
   * Mengorkestrasi seluruh proses penyerapan dokumen (Parsing -> Sanitizing -> Chunking -> Embedding -> Transactional Save)
   */
  async ingestDocument(file: any, type: DocumentType, title: string) {
    const buffer = file.buffer;
    const fileSize = buffer.length;
    const mimeType = file.mimetype;
    const originalName = file.originalname;

    // 1. Hitung hash SHA-256 berkas untuk pencegahan duplikasi
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const existingMetadata = await this.documentRepository.findByHash(hash);
    if (existingMetadata) {
      this.logger.warn(`Dokumen dengan hash biner yang sama sudah terdaftar (ID Dokumen: ${existingMetadata.documentId}). Mengembalikan dokumen eksisting.`);
      return existingMetadata.document;
    }

    // 2. Simpan berkas fisik ke disk lokal
    const timestamp = Date.now();
    const sanitizedFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const diskFileName = `${timestamp}-${sanitizedFileName}`;
    const diskFilePath = path.join(this.storageDir, diskFileName);

    try {
      fs.writeFileSync(diskFilePath, buffer);
    } catch (fsError) {
      this.logger.error(`Gagal menyimpan file ke disk: ${fsError.message}`);
      throw new InternalServerErrorException('Gagal menyimpan file fisik regulasi.');
    }

    try {
      // 3. Ambil parser yang tepat berdasarkan tipe MIME / ekstensi
      const ext = originalName.split('.').pop()?.toLowerCase() || '';
      const parser = this.parserFactory.getParser(mimeType, ext);

      // 4. Parse dokumen menjadi teks polos
      const rawText = await parser.parse(buffer);

      // 5. Sanitasi teks menggunakan pipeline (Unicode normalization, whitespace trimming)
      const cleanedText = this.sanitizerPipeline.sanitize(rawText);

      // 6. Pemotongan semantik menjadi chunks teks
      const chunks = this.chunkerService.chunkText(cleanedText);
      if (chunks.length === 0) {
        throw new ConflictException('Dokumen tidak mengandung teks yang cukup untuk di-chunk.');
      }

      // 7. Pengolahan batching embedding untuk chunks
      const embeddings = await this.batchProcessor.processInBatches(chunks);

      // 8. Petakan chunks dengan embedding-nya
      const chunkData = chunks.map((content, idx) => ({
        chunkIndex: idx,
        content,
        embedding: embeddings[idx],
      }));

      // 9. Simpan ke database dalam satu transaksi atomik
      const relativePath = path.join('storage', 'documents', diskFileName);
      const savedDoc = await this.documentRepository.saveIngestedDocument(
        {
          title,
          type,
          filePath: relativePath.replace(/\\/g, '/'), // Normalkan path untuk Windows
          status: 'AKTIF', // Default langsung aktif untuk regulasi/criteria
        },
        {
          fileSize,
          mimeType,
          totalChunks: chunks.length,
          hash,
        },
        chunkData,
      );

      return savedDoc;
    } catch (ingestError) {
      // Cleanup file yang sudah terlanjur disimpan jika transaksi gagal
      if (fs.existsSync(diskFilePath)) {
        fs.unlinkSync(diskFilePath);
      }
      this.logger.error(`Gagal melakukan ingesti dokumen: ${ingestError.message}`);
      throw ingestError;
    }
  }

  /**
   * Mengambil kecocokan semantik (RAG) atau menggunakan keyword fallback jika server embedding offline
   */
  async searchDocuments(query: string, limit = 5) {
    if (!query || query.trim() === '') {
      return [];
    }

    try {
      // Hasilkan vektor kueri
      const queryVector = await this.embeddingAdapter.generateEmbedding(query);
      return await this.documentRepository.searchSimilarity(queryVector, limit);
    } catch (error) {
      this.logger.warn(`Pembuatan embedding kueri gagal. Masuk ke pencarian kata kunci fallback: ${error.message}`);
      return this.documentRepository.searchKeyword(query, limit);
    }
  }
}
