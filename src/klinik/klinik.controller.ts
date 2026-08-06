// src/klinik/klinik.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { KlinikService } from './klinik.service';
import {
  CreateKategoriRegulasiSchema,
  CreateRegulasiSchema,
  CreateTiketKonsultasiSchema,
  SubmitJawabanSchema,
  ArchiveKmsSchema,
  CreateKategoriRegulasiDto,
  CreateRegulasiDto,
  CreateTiketKonsultasiDto,
  SubmitJawabanDto,
  ArchiveKmsDto,
} from './dto/klinik.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1')
export class KlinikController {
  constructor(private readonly klinikService: KlinikService) {}

  /**
   * POST /api/v1/regulasi/kategori
   * Membuat Kategori Regulasi Baru.
   */
  @Post('regulasi/kategori')
  @HttpCode(HttpStatus.CREATED)
  createKategoriRegulasi(
    @Body(new ZodValidationPipe(CreateKategoriRegulasiSchema)) dto: CreateKategoriRegulasiDto,
  ) {
    return this.klinikService.createKategoriRegulasi(dto);
  }

  /**
   * POST /api/v1/regulasi
   * Mendaftarkan Regulasi Baru & picu antrean embeddings vector.
   */
  @Post('regulasi')
  @HttpCode(HttpStatus.CREATED)
  createRegulasi(
    @Body(new ZodValidationPipe(CreateRegulasiSchema)) dto: CreateRegulasiDto,
  ) {
    return this.klinikService.createRegulasi(dto);
  }

  /**
   * POST /api/v1/klinik/tiket
   * OPD mengajukan Tiket Konsultasi baru dengan lampiran fisik (opsional).
   * Menerima multi-upload file (field name: 'files').
   * Mengembalikan tiket lengkap dengan draf AI Copilot RAG terisi.
   */
  @Post('klinik/tiket')
  @UseInterceptors(FilesInterceptor('files'))
  @HttpCode(HttpStatus.CREATED)
  createTiketKonsultasi(
    @Body(new ZodValidationPipe(CreateTiketKonsultasiSchema)) dto: CreateTiketKonsultasiDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.klinikService.createTiketKonsultasi(dto, files);
  }

  /**
   * POST /api/v1/klinik/tiket/:id/jawab
   * Auditor mengirimkan jawaban resmi konsultasi bagi OPD.
   */
  @Post('klinik/tiket/:id/jawab')
  @HttpCode(HttpStatus.OK)
  submitJawaban(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SubmitJawabanSchema)) dto: SubmitJawabanDto,
  ) {
    return this.klinikService.submitJawaban(id, dto);
  }

  /**
   * POST /api/v1/klinik/tiket/:id/archive
   * Mengarsipkan Tiket terstatus TERJAWAB menjadi artikel KMS Pembelajaran Umum.
   * Melakukan anonimisasi identitas sensitif secara otomatis.
   */
  @Post('klinik/tiket/:id/archive')
  @HttpCode(HttpStatus.CREATED)
  archiveToKms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ArchiveKmsSchema)) dto: ArchiveKmsDto,
  ) {
    return this.klinikService.archiveToKms(id, dto);
  }

  /**
   * GET /api/v1/regulasi
   * Menampilkan daftar semua regulasi.
   */
  @Get('regulasi')
  findAllRegulasi() {
    return this.klinikService.findAllRegulasi();
  }

  /**
   * GET /api/v1/klinik/tiket
   * Menampilkan daftar semua tiket konsultasi.
   */
  @Get('klinik/tiket')
  findAllTiket() {
    return this.klinikService.findAllTiket();
  }

  /**
   * GET /api/v1/klinik/kms
   * Menampilkan daftar semua artikel KMS Pembelajaran Publik.
   */
  @Get('klinik/kms')
  findAllKms() {
    return this.klinikService.findAllKms();
  }
}
