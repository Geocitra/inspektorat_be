// src/lhp/lhp.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LhpService } from './lhp.service';
import { NhpGeneratorService } from './services/nhp-generator.service';
import { FeedbackAnalyzerService } from './services/feedback-analyzer.service';
import {
  CreateLhpSchema,
  SignLhpSchema,
  CreateLhpDto,
  SignLhpDto,
} from './dto/lhp.dto';
import {
  GenerateNhpSchema,
  GenerateNhpDto,
} from './dto/nhp.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FileSignatureValidationPipe } from '../common/pipes/file-signature-validation.pipe';

@Controller('api/v1/lhp')
export class LhpController {
  constructor(
    private readonly lhpService: LhpService,
    private readonly nhpGeneratorService: NhpGeneratorService,
    private readonly feedbackAnalyzerService: FeedbackAnalyzerService,
  ) { }

  /**
   * POST /api/v1/lhp
   * Membuat draf LHP dan memicu BullMQ compiler.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ZodValidationPipe(CreateLhpSchema)) dto: CreateLhpDto) {
    return this.lhpService.createLhp(dto);
  }

  /**
   * POST /api/v1/lhp/generate-nhp
   * Memicu AI untuk mengekstrak anomali pengadaan dan meracik draf Naskah Hasil Pemeriksaan (NHP).
   */
  @Post('generate-nhp')
  @HttpCode(HttpStatus.OK)
  generateNhp(
    @Body(new ZodValidationPipe(GenerateNhpSchema)) dto: GenerateNhpDto,
  ) {
    return this.nhpGeneratorService.generateNhp(dto.stId);
  }

  /**
   * POST /api/v1/lhp/:id/respond
   * Menerima unggahan dokumen tanggapan tertulis resmi OPD (PDF) dan dievaluasi kelayakan hukumnya oleh AI.
   */
  @Post(':id/respond')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  uploadFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(FileSignatureValidationPipe) file: any,
  ) {
    return this.feedbackAnalyzerService.analyzeFeedback(id, file);
  }

  /**
   * POST /api/v1/lhp/:id/sign
   * Mengesahkan LHP via TTE digital signature.
   */
  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  signLhp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SignLhpSchema)) dto: SignLhpDto,
  ) {
    return this.lhpService.signLhp(id, dto);
  }

  /**
   * GET /api/v1/lhp
   * List seluruh LHP.
   */
  @Get()
  findAll() {
    return this.lhpService.findAll();
  }

  /**
   * GET /api/v1/lhp/:id
   * Detail LHP.
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.lhpService.findOne(id);
  }
}