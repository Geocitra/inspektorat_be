// src/document-ingestion/repositories/document.repository.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentType, DocumentStatus } from '@prisma/client';

@Injectable()
export class DocumentRepository {
  private readonly logger = new Logger(DocumentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Menyimpan dokumen, metadata, dan chunks dalam satu transaksi database atomik
   */
  async saveIngestedDocument(
    document: { title: string; type: DocumentType; filePath: string; status?: DocumentStatus },
    metadata: { fileSize: number; mimeType: string; totalChunks: number; totalTokens?: number; hash: string },
    chunks: { chunkIndex: number; content: string; embedding: number[] }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Simpan induk dokumen
      const savedDoc = await tx.auditDocument.create({
        data: {
          title: document.title,
          type: document.type,
          filePath: document.filePath,
          status: document.status || DocumentStatus.DRAF,
        },
      });

      // 2. Simpan metadata berkas
      await tx.docMetadata.create({
        data: {
          documentId: savedDoc.id,
          fileSize: metadata.fileSize,
          mimeType: metadata.mimeType,
          totalChunks: metadata.totalChunks,
          totalTokens: metadata.totalTokens,
          hash: metadata.hash,
        },
      });

      // 3. Simpan chunks teks & vektor
      const chunkData = chunks.map((chunk) => ({
        documentId: savedDoc.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding,
      }));

      await tx.docChunk.createMany({
        data: chunkData,
      });

      this.logger.log(`Berhasil menyimpan dokumen "${document.title}" (ID: ${savedDoc.id}) beserta ${chunks.length} chunks secara atomik.`);
      return savedDoc;
    });
  }

  /**
   * Memeriksa apakah berkas dengan hash md5/sha256 yang sama sudah pernah diunggah
   */
  async findByHash(hash: string) {
    return this.prisma.docMetadata.findFirst({
      where: { hash },
      include: { document: true },
    });
  }

  /**
   * Mencari kecocokan chunks secara semantik menggunakan pgvector SQL dengan fallback Keyword
   */
  async searchSimilarity(queryVector: number[], limit = 5): Promise<any[]> {
    const vectorStr = `[${queryVector.join(',')}]`;

    try {
      const rawResults: any[] = await this.prisma.$queryRawUnsafe(
        `
        SELECT 
          c.id, 
          c.chunk_index AS "chunkIndex", 
          c.content, 
          c.document_id AS "documentId",
          (1 - (c.embedding::vector <=> $1::vector)) AS "similarity"
        FROM doc_chunks c
        INNER JOIN audit_documents d ON c.document_id = d.id
        WHERE d.status = 'AKTIF'
        ORDER BY "similarity" DESC
        LIMIT $2;
        `,
        vectorStr,
        limit,
      );

      return rawResults.map((r) => ({
        id: r.id,
        chunkIndex: r.chunkIndex,
        content: r.content,
        embedding: [], // Tidak perlu dikembalikan ke memori
        similarity: parseFloat(r.similarity) || 0.0,
        document: { id: r.documentId }
      }));
    } catch (rawError) {
      this.logger.warn(`pgvector tidak didukung atau belum dipasang di database. Menjalankan fallback keyword search.`);
      // Fallback menggunakan keyword search
      return this.searchKeyword('', limit);
    }
  }

  /**
   * Kueri pencarian teks fallback jika Ollama server sedang mati/offline
   */
  async searchKeyword(keyword: string, limit = 5): Promise<any[]> {
    this.logger.log(`Menjalankan pencarian fallback kata kunci: "${keyword}"`);
    return this.prisma.docChunk.findMany({
      where: {
        document: {
          status: DocumentStatus.AKTIF,
        },
        content: {
          contains: keyword,
          mode: 'insensitive',
        },
      },
      include: {
        document: true,
      },
      take: limit,
    });
  }

  /**
   * Helper untuk menghitung kesamaan kosinus antara dua vektor
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0.0;
    
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0.0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
