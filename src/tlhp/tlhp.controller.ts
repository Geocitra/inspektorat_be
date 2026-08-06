// src/tlhp/tlhp.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Req,
  Ip,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TlhpService } from './tlhp.service';
import { ContextualAuthGuard } from '../common/guards/contextual-auth.guard';
import {
  CreateTindakLanjutSchema,
  CreateVerifikasiSchema,
  LockFindingSchema,
  CreateTindakLanjutDto,
  CreateVerifikasiDto,
  LockFindingDto,
} from './dto/tlhp.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1')
export class TlhpController {
  constructor(private readonly tlhpService: TlhpService) {}

  /**
   * POST /api/v1/tlhp
   * Mengunggah bukti tindak lanjut oleh OPD.
   * Menerima upload file gambar tunggal (field name: 'file').
   */
  @Post('tlhp')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  createTindakLanjut(
    @Body(new ZodValidationPipe(CreateTindakLanjutSchema)) dto: CreateTindakLanjutDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.tlhpService.createTindakLanjut(dto, file);
  }

  /**
   * POST /api/v1/tlhp/:id/verifikasi
   * Verifikasi bukti tindak lanjut oleh Auditor.
   */
  @Post('tlhp/:id/verifikasi')
  @HttpCode(HttpStatus.OK)
  verifyTindakLanjut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateVerifikasiSchema)) dto: CreateVerifikasiDto,
  ) {
    return this.tlhpService.verifyTindakLanjut(id, dto);
  }

  /**
   * POST /api/v1/temuan/:id/lock
   * Penguncian temuan menjadi TUNTAS oleh Irban (Pimpinan).
   * Menulis ledger security audit log & memicu rekalkulasi BullMQ.
   */
  @Post('temuan/:id/lock')
  @UseGuards(ContextualAuthGuard)
  @HttpCode(HttpStatus.OK)
  lockFinding(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(LockFindingSchema)) dto: LockFindingDto,
    @Ip() ipAddress: string,
  ) {
    return this.tlhpService.lockFinding(id, dto, ipAddress);
  }

  /**
   * GET /api/v1/opd/:opdId/compliance
   * Mendapatkan skor persentase kepatuhan OPD terintegrasi dari Redis.
   */
  @Get('opd/:opdId/compliance')
  async getComplianceScore(@Param('opdId', ParseUUIDPipe) opdId: string) {
    const score = await this.tlhpService.getComplianceScore(opdId);
    return {
      opdId,
      complianceScore: parseFloat(score),
    };
  }

  /**
   * GET /api/v1/tlhp
   * Mengambil semua daftar tindak lanjut.
   */
  @Get('tlhp')
  findAllTindakLanjut() {
    return this.tlhpService.findAllTindakLanjut();
  }
}
