// src/wbs/wbs.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { WbsService } from './wbs.service';
import { ContextualAuthGuard } from '../common/guards/contextual-auth.guard';
import {
  CreateWbsAduanSchema,
  TriageComplaintSchema,
  SendChatSchema,
  ApproveRekomendasiSchema,
  CreateWbsAduanDto,
  TriageComplaintDto,
  SendChatDto,
  ApproveRekomendasiDto,
} from './dto/wbs.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1/wbs')
export class WbsController {
  constructor(private readonly wbsService: WbsService) {}

  /**
   * POST /api/v1/wbs
   * Mengirim aduan WBS anonim baru dengan melampirkan berkas bukti fisik (terenkripsi).
   * Menerima multi-upload file (field name: 'files').
   */
  @Post()
  @UseInterceptors(FilesInterceptor('files'))
  @HttpCode(HttpStatus.CREATED)
  submitWbsComplaint(
    @Body(new ZodValidationPipe(CreateWbsAduanSchema)) dto: CreateWbsAduanDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.wbsService.submitWbsComplaint(dto, files);
  }

  /**
   * GET /api/v1/wbs/track/:token
   * Melacak status aduan anonim & mendekripsi deskripsi konten untuk pelapor.
   */
  @Get('track/:token')
  trackComplaint(@Param('token') token: string) {
    return this.wbsService.trackComplaint(token);
  }

  /**
   * POST /api/v1/wbs/:id/triage
   * Telaah / triage pengaduan oleh investigator.
   */
  @Post(':id/triage')
  @UseGuards(ContextualAuthGuard)
  @HttpCode(HttpStatus.OK)
  triageComplaint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(TriageComplaintSchema)) dto: TriageComplaintDto,
  ) {
    return this.wbsService.triageComplaint(id, dto);
  }

  /**
   * POST /api/v1/wbs/:id/chat
   * Mengirim pesan baru ke obrolan utas anonim.
   * Whistleblower wajib melampirkan query param tokenPelacakan untuk otentikasi.
   */
  @Post(':id/chat')
  @HttpCode(HttpStatus.CREATED)
  sendChat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SendChatSchema)) dto: SendChatDto,
  ) {
    return this.wbsService.sendChat(id, dto);
  }

  /**
   * GET /api/v1/wbs/:id/chat
   * Mendapatkan riwayat pesan obrolan asinkron anonim.
   */
  @Get(':id/chat')
  getChatHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tokenPelacakan') tokenPelacakan?: string,
  ) {
    return this.wbsService.getChatHistory(id, tokenPelacakan);
  }

  /**
   * POST /api/v1/wbs/rekomendasi/:id/approve
   * Pengesahan rekomendasi audit investigatif oleh Inspektur.
   * Melahirkan draf ST baru di Klaster A dengan deteksi bentrok jadwal auditor.
   */
  @Post('rekomendasi/:id/approve')
  @UseGuards(ContextualAuthGuard)
  @HttpCode(HttpStatus.OK)
  approveRekomendasi(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveRekomendasiSchema)) dto: ApproveRekomendasiDto,
  ) {
    return this.wbsService.approveRekomendasi(id, dto);
  }

  /**
   * GET /api/v1/wbs
   * Menampilkan daftar semua pengaduan WBS (investigator panel).
   */
  @Get()
  @UseGuards(ContextualAuthGuard)
  findAllAduan() {
    return this.wbsService.findAllAduan();
  }
}
