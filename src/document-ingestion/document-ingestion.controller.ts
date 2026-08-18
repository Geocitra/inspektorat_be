// src/document-ingestion/document-ingestion.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
  Body,
  Query,
  BadRequestException,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentIngestionService } from './services/document-ingestion.service';
import { FileSignatureValidationPipe } from '../common/pipes/file-signature-validation.pipe';
import { GlobalRoleGuard } from '../common/guards/global-role.guard'; // [REFACTOR] Gunakan Global Guard
import { DocumentType } from '@prisma/client';

@Controller('api/v1/documents')
@UseGuards(GlobalRoleGuard) // [REFACTOR] Barikade Keamanan (Akses Terbatas Tanpa Butuh Konteks ST)
export class DocumentIngestionController {
  constructor(private readonly ingestionService: DocumentIngestionService) { }

  /**
   * Endpoint untuk mengunggah regulasi/SOP (ingesti dokumen ke RAG)
   * Menggunakan pola Fire-and-Forget (Asynchronous Queue)
   */
  @Post('ingest')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted: Diterima namun belum selesai diproses
  @UseInterceptors(FileInterceptor('file'))
  async ingestDocument(
    @UploadedFile(FileSignatureValidationPipe) file: any,
    @Body('type') type: DocumentType,
    @Body('title') title: string,
    @Body('opdId') opdId?: string,
  ) {
    if (!type || !title) {
      throw new BadRequestException('Parameter type (DocumentType) dan title wajib diisi.');
    }

    if (!Object.values(DocumentType).includes(type)) {
      throw new BadRequestException(
        `Tipe dokumen "${type}" tidak valid. Harus salah satu dari: ${Object.values(DocumentType).join(', ')}`,
      );
    }

    // Mendelegasikan tugas ke Service untuk disimpan secara I/O Async dan masuk antrean
    const jobResult = await this.ingestionService.queueDocumentForIngestion(file, type, title, opdId);

    return {
      success: true,
      message: 'Dokumen berhasil diterima dan sedang diproses di latar belakang oleh AI Worker.',
      data: jobResult,
    };
  }

  /**
   * Endpoint untuk mengambil daftar dokumen di Knowledge Base (opsional filter per OPD)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query('opdId') opdId?: string) {
    const documents = await this.ingestionService.findAllDocuments(opdId);
    return {
      success: true,
      message: 'Berhasil mengambil daftar dokumen Knowledge Base.',
      data: documents,
    };
  }

  /**
   * Endpoint untuk mencari regulasi secara semantik (RAG search)
   * Tetap berjalan sinkron karena pencarian membutuhkan hasil seketika (Fast Retrieval)
   */
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async search(@Query('q') query: string, @Query('limit') limitStr?: string) {
    if (!query) {
      throw new BadRequestException('Parameter pencarian "q" wajib diisi.');
    }

    const limit = limitStr ? parseInt(limitStr, 10) : 5;
    const results = await this.ingestionService.searchDocuments(query, limit);

    return {
      success: true,
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

  /**
   * Endpoint untuk memeriksa status pekerjaan BullMQ (RAG ingestion)
   */
  @Get('job/:id')
  @HttpCode(HttpStatus.OK)
  async getJobStatus(@Param('id') id: string) {
    const jobStatus = await this.ingestionService.getJobStatus(id);
    return {
      success: true,
      data: jobStatus,
    };
  }

  /**
   * Endpoint untuk menghapus dokumen beserta vektornya dari Knowledge Base
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.ingestionService.deleteDocument(id);
    return {
      success: true,
      message: result.message,
    };
  }
}