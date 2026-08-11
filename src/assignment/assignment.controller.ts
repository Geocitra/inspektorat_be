import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Delete,
} from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { TeamAllocationService } from './services/team-allocation.service';
import { PkaGeneratorService } from './services/pka-generator.service';
import {
  CreateStSchema,
  SignStSchema,
  RecommendTeamSchema,
  GeneratePkaSchema,
  CreateStDto,
  SignStDto,
  RecommendTeamDto,
  GeneratePkaDto,
} from './dto/st.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/v1/surat-tugas')
export class AssignmentController {
  constructor(
    private readonly assignmentService: AssignmentService,
    private readonly teamAllocationService: TeamAllocationService,
    private readonly pkaGeneratorService: PkaGeneratorService,
  ) {}

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

  /**
   * DELETE /api/v1/surat-tugas/:id
   * Menghapus draf Surat Tugas.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteSt(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignmentService.deleteSt(id);
  }

  /**
   * POST /api/v1/surat-tugas/recommend-team
   * Merekomendasikan tim auditor optimal bebas konflik jadwal.
   */
  @Post('recommend-team')
  @HttpCode(HttpStatus.OK)
  recommendTeam(
    @Body(new ZodValidationPipe(RecommendTeamSchema)) dto: RecommendTeamDto,
  ) {
    return this.teamAllocationService.recommendTeam(
      new Date(dto.tanggalMulai),
      new Date(dto.tanggalSelesai),
      dto.fokusAudit,
    );
  }

  /**
   * POST /api/v1/surat-tugas/:id/generate-pka
   * Memicu generasi langkah kerja PKA berbasis AI.
   */
  @Post(':id/generate-pka')
  @HttpCode(HttpStatus.OK)
  generatePka(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(GeneratePkaSchema)) dto: GeneratePkaDto,
  ) {
    return this.pkaGeneratorService.generatePka(id, dto.fokusPengawasan);
  }
}
