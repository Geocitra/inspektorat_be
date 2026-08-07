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
  ParseIntPipe,
} from '@nestjs/common';
import { AuditPlanningService } from './audit-planning.service';
import { RiskAssessmentService } from './services/risk-assessment.service';
import { PkptGeneratorService } from './services/pkpt-generator.service';
import {
  CreatePkptSchema,
  CreateAgendaSchema,
  ApprovePkptSchema,
  CreatePkptDto,
  CreateAgendaDto,
  ApprovePkptDto,
} from './dto/pkpt.dto';
import {
  CalculateRiskSchema,
  GenerateDraftSchema,
  CalculateRiskDto,
  GenerateDraftDto,
} from './dto/ai-planning.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1')
export class AuditPlanningController {
  constructor(
    private readonly auditPlanningService: AuditPlanningService,
    private readonly riskService: RiskAssessmentService,
    private readonly pkptGeneratorService: PkptGeneratorService,
  ) {}

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

  /**
   * POST /api/v1/pkpt/calculate-risk
   * Memicu kalkulasi penilaian risiko OPD untuk tahun tertentu.
   */
  @Post('pkpt/calculate-risk')
  @HttpCode(HttpStatus.OK)
  calculateRisk(
    @Body(new ZodValidationPipe(CalculateRiskSchema)) dto: CalculateRiskDto,
  ) {
    return this.riskService.calculateRisk(dto.tahun);
  }

  /**
   * POST /api/v1/pkpt/generate-draft
   * Memicu generasi draf usulan PKPT & Agenda audit berbasis AI.
   */
  @Post('pkpt/generate-draft')
  @HttpCode(HttpStatus.OK)
  generateDraft(
    @Body(new ZodValidationPipe(GenerateDraftSchema)) dto: GenerateDraftDto,
  ) {
    return this.pkptGeneratorService.generateDraftPkpt(
      dto.tahunAnggaran,
      dto.instruksiTambahan,
    );
  }

  /**
   * GET /api/v1/pkpt/ranking/:tahun
   * Mengambil hasil ranking risiko OPD.
   */
  @Get('pkpt/ranking/:tahun')
  getRiskRanking(@Param('tahun', ParseIntPipe) tahun: number) {
    return this.riskService.getRiskRanking(tahun);
  }
}
