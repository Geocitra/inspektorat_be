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
} from '@nestjs/common';
import { LhpService } from './lhp.service';
import {
  CreateLhpSchema,
  SignLhpSchema,
  CreateLhpDto,
  SignLhpDto,
} from './dto/lhp.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1/lhp')
export class LhpController {
  constructor(private readonly lhpService: LhpService) {}

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
