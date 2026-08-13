// src/audit-planning/audit-planning.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuditPlanningService } from './audit-planning.service';
import { RiskAssessmentService } from './services/risk-assessment.service';
import { PkptGeneratorService } from './services/pkpt-generator.service';
import {
  CreatePkptSchema,
  CreateAgendaSchema,
  ApprovePkptSchema,
  UpdateAgendaSchema,
  RejectPkptSchema,
  CreatePkptDto,
  CreateAgendaDto,
  ApprovePkptDto,
  UpdateAgendaDto,
  RejectPkptDto,
} from './dto/pkpt.dto';
import {
  CalculateRiskSchema,
  GenerateDraftSchema,
  ParseDocumentSchema,
  CalculateRiskDto,
  GenerateDraftDto,
  ParseDocumentDto,
} from './dto/ai-planning.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FileSignatureValidationPipe } from '../common/pipes/file-signature-validation.pipe';

@Controller('api/v1')
export class AuditPlanningController {
  constructor(
    private readonly auditPlanningService: AuditPlanningService,
    private readonly riskService: RiskAssessmentService,
    private readonly pkptGeneratorService: PkptGeneratorService,
  ) { }

  /**
   * POST /api/v1/pkpt
   * Membuat draf PKPT baru secara manual.
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

  // [FITUR BARU] Endpoint Update Agenda
  @Put('pkpt/agenda/:id')
  updateAgenda(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAgendaSchema)) dto: UpdateAgendaDto
  ) {
    return this.auditPlanningService.updateAgenda(id, dto);
  }

  // [FITUR BARU] Endpoint Submit Draf
  @Post('pkpt/:id/submit')
  @HttpCode(HttpStatus.OK)
  submitPkpt(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditPlanningService.submitPkpt(id);
  }

  // [FITUR BARU] Endpoint Tolak PKPT
  @Post('pkpt/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectPkpt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RejectPkptSchema)) dto: RejectPkptDto
  ) {
    return this.auditPlanningService.rejectPkpt(id, dto);
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
   * Memicu generasi draf usulan PKPT & Agenda audit berbasis AI (Zero-to-Hero).
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
   * POST /api/v1/pkpt/parse-document
   * [FITUR BARU] Memicu ekstraksi AI dari file fisik (Excel/PDF) PKPT eksisting.
   */
  @Post('pkpt/parse-document')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  parseDocument(
    @UploadedFile(FileSignatureValidationPipe) file: any,
    @Body(new ZodValidationPipe(ParseDocumentSchema)) dto: ParseDocumentDto,
  ) {
    return this.pkptGeneratorService.parseExistingPkpt(dto.tahunAnggaran, file);
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