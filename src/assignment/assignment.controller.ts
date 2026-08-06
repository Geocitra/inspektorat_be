// src/assignment/assignment.controller.ts
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
import { AssignmentService } from './assignment.service';
import {
  CreateStSchema,
  SignStSchema,
  CreateStDto,
  SignStDto,
} from './dto/st.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1/surat-tugas')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  /**
   * POST /api/v1/surat-tugas
   * Membuat draf Surat Tugas baru.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createSt(@Body(new ZodValidationPipe(CreateStSchema)) dto: CreateStDto) {
    return this.assignmentService.createSt(dto);
  }

  /**
   * POST /api/v1/surat-tugas/:id/sign
   * Menandatangani Surat Tugas (TTE).
   */
  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  signSt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SignStSchema)) dto: SignStDto,
  ) {
    return this.assignmentService.signSt(id, dto);
  }

  /**
   * GET /api/v1/surat-tugas
   * List seluruh Surat Tugas.
   */
  @Get()
  findAllSt() {
    return this.assignmentService.findAllSt();
  }

  /**
   * GET /api/v1/surat-tugas/:id
   * Detail Surat Tugas.
   */
  @Get(':id')
  findOneSt(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignmentService.findOneSt(id);
  }
}
