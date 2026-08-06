// src/opd/opd.controller.ts
// REST Controller untuk endpoint OPD.
// Base URL: /api/v1/opd
// Menggunakan ZodValidationPipe untuk validasi input yang type-safe.

import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OpdService } from './opd.service';
import {
  CreateOpdSchema,
  UpdateOpdSchema,
  CreateOpdDto,
  UpdateOpdDto,
} from './dto/opd.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1/opd')
export class OpdController {
  constructor(private readonly opdService: OpdService) {}

  /**
   * POST /api/v1/opd
   * Membuat data OPD baru.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ZodValidationPipe(CreateOpdSchema)) dto: CreateOpdDto) {
    return this.opdService.create(dto);
  }

  /**
   * GET /api/v1/opd
   * Mengambil seluruh daftar OPD.
   */
  @Get()
  findAll() {
    return this.opdService.findAll();
  }

  /**
   * GET /api/v1/opd/:id
   * Mengambil detail satu OPD berdasarkan UUID.
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.opdService.findOne(id);
  }

  /**
   * PUT /api/v1/opd/:id
   * Memperbarui data OPD (partial update).
   */
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateOpdSchema)) dto: UpdateOpdDto,
  ) {
    return this.opdService.update(id, dto);
  }

  /**
   * DELETE /api/v1/opd/:id
   * Menghapus data OPD (gagal jika masih ada pegawai terikat).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.opdService.delete(id);
  }
}
