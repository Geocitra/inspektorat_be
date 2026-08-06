// src/audit-planning/audit-planning.controller.ts
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
import { AuditPlanningService } from './audit-planning.service';
import {
  CreatePkptSchema,
  CreateAgendaSchema,
  ApprovePkptSchema,
  CreatePkptDto,
  CreateAgendaDto,
  ApprovePkptDto,
} from './dto/pkpt.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1')
export class AuditPlanningController {
  constructor(private readonly auditPlanningService: AuditPlanningService) {}

  /**
   * POST /api/v1/pkpt
   * Membuat draf PKPT baru.
   */
  @Post('pkpt')
  @HttpCode(HttpStatus.CREATED)
  createPkpt(
    @Body(new ZodValidationPipe(CreatePkptSchema)) dto: CreatePkptDto,
  ) {
    return this.auditPlanningService.createPkpt(dto);
  }

  /**
   * POST /api/v1/pkpt/agenda
   * Menambahkan agenda pengawasan ke PKPT.
   */
  @Post('pkpt/agenda')
  @HttpCode(HttpStatus.CREATED)
  createAgenda(
    @Body(new ZodValidationPipe(CreateAgendaSchema)) dto: CreateAgendaDto,
  ) {
    return this.auditPlanningService.createAgenda(dto);
  }

  /**
   * POST /api/v1/pkpt/:id/approve
   * Mengesahkan/menyetujui PKPT oleh Inspektur.
   */
  @Post('pkpt/:id/approve')
  @HttpCode(HttpStatus.OK)
  approvePkpt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApprovePkptSchema)) dto: ApprovePkptDto,
  ) {
    return this.auditPlanningService.approvePkpt(id, dto);
  }

  /**
   * GET /api/v1/pkpt
   * Mengambil semua PKPT.
   */
  @Get('pkpt')
  findAllPkpt() {
    return this.auditPlanningService.findAllPkpt();
  }

  /**
   * GET /api/v1/pkpt/:id
   * Detail PKPT dan agenda di dalamnya.
   */
  @Get('pkpt/:id')
  findOnePkpt(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditPlanningService.findOnePkpt(id);
  }

  /**
   * GET /api/v1/agenda
   * Mengambil semua agenda audit untuk referensi.
   */
  @Get('agenda')
  findAllAgenda() {
    return this.auditPlanningService.findAllAgenda();
  }
}
