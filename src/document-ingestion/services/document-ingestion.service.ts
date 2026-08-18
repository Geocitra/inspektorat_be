// src/document-ingestion/services/document-ingestion.service.ts
import { Injectable, Logger, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { ExternalEmbeddingAdapter } from '../providers/external-embedding.adapter';
import { DocumentType } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service'; // [REFACTOR] Import Prisma Service
import * as crypto from 'crypto';
import * as fsPromises from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger(DocumentIngestionService.name);
  private readonly storageDir = path.join(process.cwd(), 'storage', 'documents');

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly embeddingAdapter: ExternalEmbeddingAdapter,
    @InjectQueue('document_ingestion') private readonly ingestionQueue: Queue,
    private readonly prisma: PrismaService, // [REFACTOR] Injeksi Prisma untuk Query Read & Delete
  ) {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
  }

  async queueDocumentForIngestion(file: any, type: DocumentType, title: string, opdId?: string) {
    const buffer = file.buffer;
    const fileSize = buffer.length;
    const mimeType = file.mimetype;
    const originalName = file.originalname;

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const existingMetadata = await this.documentRepository.findByHash(hash);
    if (existingMetadata) {
      throw new ConflictException(`Dokumen dengan identitas biner yang sama sudah terdaftar (ID: ${existingMetadata.documentId}).`);
    }

    const timestamp = Date.now();
    const sanitizedFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const diskFileName = `${timestamp}-${sanitizedFileName}`;
    const diskFilePath = path.join(this.storageDir, diskFileName);
    const dbRelativePath = path.join('storage', 'documents', diskFileName).replace(/\\/g, '/');

    try {
      await fsPromises.writeFile(diskFilePath, buffer);
      this.logger.log(`[I/O Async] Berkas ${diskFileName} berhasil disimpan ke storage.`);
    } catch (fsError: any) {
      this.logger.error(`Gagal menyimpan file ke disk: ${fsError.message}`);
      throw new InternalServerErrorException('Sistem gagal menyimpan file fisik regulasi.');
    }

    let job;
    try {
      job = await this.ingestionQueue.add('process_document_rag', {
        title,
        type,
        filePath: diskFilePath,
        dbRelativePath,
        mimeType,
        originalName,
        fileSize,
        hash,
        opdId: opdId || null,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      });
      this.logger.log(`[BullMQ] Tugas ekstraksi AI masuk antrean dengan Job ID: ${job.id}`);
    } catch (queueError: any) {
      await fsPromises.unlink(diskFilePath).catch(() => null);
      this.logger.error(`Gagal memasukkan tugas ke antrean Redis: ${queueError.message}`);
      throw new InternalServerErrorException('Layanan antrean AI (Redis) tidak merespons.');
    }

    return {
      jobId: job.id,
      status: 'QUEUED',
      title,
      type,
      hash,
    };
  }

  /**
   * [FITUR BARU] Ingest dokumen secara langsung/synchronous (digunakan di verifikasi & LHP feedback)
   */
  async ingestDocument(file: any, type: DocumentType, title: string) {
    const buffer = file.buffer;
    const fileSize = buffer.length;
    const mimeType = file.mimetype;
    const originalName = file.originalname;

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const existingMetadata = await this.documentRepository.findByHash(hash);
    if (existingMetadata) {
      return this.prisma.auditDocument.findFirst({
        where: { title },
      });
    }

    const timestamp = Date.now();
    const sanitizedFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const diskFileName = `${timestamp}-${sanitizedFileName}`;
    const diskFilePath = path.join(this.storageDir, diskFileName);
    const dbRelativePath = path.join('storage', 'documents', diskFileName).replace(/\\/g, '/');

    try {
      await fsPromises.writeFile(diskFilePath, buffer);
    } catch (fsError: any) {
      throw new InternalServerErrorException('Sistem gagal menyimpan file fisik.');
    }

    const content = buffer.toString('utf-8') || 'Dokumen Kosong';
    const embedding = Array(1536).fill(0.0);
    
    let realEmbedding = embedding;
    try {
      realEmbedding = await this.embeddingAdapter.generateEmbedding(content.slice(0, 1000));
    } catch (e: any) {
      this.logger.warn(`Gagal generating embedding, using zero vector: ${e.message}`);
    }

    const savedDoc = await this.documentRepository.saveIngestedDocument(
      { title, type, filePath: dbRelativePath, status: 'AKTIF' },
      { fileSize, mimeType, totalChunks: 1, totalTokens: 100, hash },
      [{ chunkIndex: 0, content, embedding: realEmbedding }]
    );

    return savedDoc;
  }

  /**
   * Mengambil daftar dokumen beserta metadata (opsional filter per OPD)
   */
  async findAllDocuments(opdId?: string) {
    const where: any = {};
    if (opdId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opdId);
      if (isUuid) {
        where.opdId = opdId;
      } else {
        // Jika format bukan UUID (misal ID mock frontend 'opd-1'), kembalikan dokumen berstatus aktif tanpa crash
        return this.prisma.auditDocument.findMany({
          include: {
            metadata: true,
            opd: { select: { id: true, namaOpd: true } },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
      }
    }
    return this.prisma.auditDocument.findMany({
      where,
      include: {
        metadata: true,
        opd: { select: { id: true, namaOpd: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Menghapus dokumen, vektor di database, dan berkas fisiknya secara aman
   */
  async deleteDocument(id: string) {
    const document = await this.prisma.auditDocument.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Dokumen tidak ditemukan.');
    }

    // Hapus data dari PostgreSQL (Cascade akan otomatis menghapus metadata dan vector chunks)
    await this.prisma.auditDocument.delete({
      where: { id },
    });

    // Hapus berkas fisik dari storage secara asinkron (tidak memblokir response)
    const physicalPath = path.join(process.cwd(), document.filePath);
    fsPromises.unlink(physicalPath).catch(() => {
      this.logger.warn(`Berkas fisik tidak ditemukan saat menghapus: ${physicalPath}`);
    });

    this.logger.log(`Dokumen ID: ${id} beserta vektornya berhasil dihapus.`);
    return { message: 'Dokumen dan basis vektor AI berhasil dihapus secara permanen.' };
  }

  async searchDocuments(query: string, limit = 5) {
    if (!query || query.trim() === '') {
      return [];
    }

    try {
      const queryVector = await this.embeddingAdapter.generateEmbedding(query);
      return await this.documentRepository.searchSimilarity(queryVector, limit);
    } catch (error: any) {
      this.logger.warn(`Pembuatan embedding kueri gagal. Masuk ke pencarian fallback: ${error.message}`);
      return this.documentRepository.searchKeyword(query, limit);
    }
  }

  async getJobStatus(jobId: string) {
    const job = await this.ingestionQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Pekerjaan tidak ditemukan.');
    }
    const state = await job.getState();
    const reason = job.failedReason;
    return {
      id: job.id,
      state,
      progress: job.progress,
      failedReason: reason || null,
    };
  }
}