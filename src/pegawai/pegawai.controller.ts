// src/pegawai/pegawai.controller.ts
// REST Controller untuk endpoint Pegawai.
// Base URL: /api/v1/pegawai
//
// PERHATIAN KEAMANAN:
// Endpoint POST /sync dilindungi ThrottlerGuard berbasis Redis.
// Maksimal 10 request per 60 detik per IP untuk mencegah serangan DDOS
// pada endpoint integrasi dengan server BKD.

import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PegawaiService } from './pegawai.service';
import {
  CreatePegawaiSchema,
  UpdatePegawaiSchema,
  SyncPegawaiSchema,
  CreatePegawaiDto,
  UpdatePegawaiDto,
  SyncPegawaiDto,
} from './dto/pegawai.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1/pegawai')
export class PegawaiController {
  constructor(private readonly pegawaiService: PegawaiService) {}

  /**
   * POST /api/v1/pegawai
   * Membuat data pegawai baru secara manual.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CreatePegawaiSchema)) dto: CreatePegawaiDto,
  ) {
    return this.pegawaiService.create(dto);
  }

  /**
   * POST /api/v1/pegawai/sync
   * Endpoint Webhook untuk menerima push data dari server BKD.
   * Dilindungi Rate Limiter Redis: maks 10 request/menit per IP.
   *
   * Cara penggunaan BKD: POST ke endpoint ini dengan data pegawai.
   * Sistem akan otomatis melakukan UPSERT (update jika ada, create jika belum).
   */
  @UseGuards(ThrottlerGuard)
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(@Body(new ZodValidationPipe(SyncPegawaiSchema)) dto: SyncPegawaiDto) {
    return this.pegawaiService.syncFromBkd(dto);
  }

  /**
   * GET /api/v1/pegawai
   * Mengambil seluruh daftar pegawai beserta nama OPD-nya.
   */
  @Get()
  findAll() {
    return this.pegawaiService.findAll();
  }

  /**
   * GET /api/v1/pegawai/:id
   * Mengambil detail satu pegawai berdasarkan UUID.
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pegawaiService.findOne(id);
  }

  /**
   * PUT /api/v1/pegawai/:id
   * Memperbarui data pegawai (partial update).
   */
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePegawaiSchema)) dto: UpdatePegawaiDto,
  ) {
    return this.pegawaiService.update(id, dto);
  }

  /**
   * DELETE /api/v1/pegawai/:id
   * Menghapus data pegawai.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.pegawaiService.delete(id);
  }
}
