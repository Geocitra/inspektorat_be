// src/document-ingestion/document-ingestion.controller.ts
import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentIngestionService } from './services/document-ingestion.service';
import { FileSignatureValidationPipe } from '../common/pipes/file-signature-validation.pipe';
import { DocumentType } from '@prisma/client';

@Controller('api/v1/documents')
export class DocumentIngestionController {
  constructor(private readonly ingestionService: DocumentIngestionService) {}

  /**
   * Endpoint untuk mengunggah regulasi (ingesti dokumen ke RAG)
   */
  @Post('ingest')
  @UseInterceptors(FileInterceptor('file'))
  async ingestDocument(
    @UploadedFile(FileSignatureValidationPipe) file: any,
    @Body('type') type: DocumentType,
    @Body('title') title: string,
  ) {
    if (!type || !title) {
      throw new BadRequestException('Parameter type (DocumentType) dan title wajib diisi.');
    }

    // Pastikan type bernilai valid sesuai enum
    if (!Object.values(DocumentType).includes(type)) {
      throw new BadRequestException(
        `Tipe dokumen "${type}" tidak valid. Harus salah satu dari: ${Object.values(DocumentType).join(', ')}`,
      );
    }

    const doc = await this.ingestionService.ingestDocument(file, type, title);
    return {
      message: 'Dokumen berhasil di-ingest dan di-vektorisasi.',
      data: doc,
    };
  }

  /**
   * Endpoint untuk mencari regulasi secara semantik (RAG search)
   */
  @Get('search')
  async search(@Query('q') query: string, @Query('limit') limitStr?: string) {
    if (!query) {
      throw new BadRequestException('Parameter pencarian "q" wajib diisi.');
    }

    const limit = limitStr ? parseInt(limitStr, 10) : 5;
    const results = await this.ingestionService.searchDocuments(query, limit);

    return {
      message: 'Pencarian semantik berhasil dilakukan.',
      data: results.map((r) => ({
        chunkId: r.id,
        chunkIndex: r.chunkIndex,
        content: r.content,
        similarity: r.similarity ?? null,
        document: {
          id: r.document.id,
          title: r.document.title,
          type: r.document.type,
          filePath: r.document.filePath,
        },
      })),
    };
  }
}
