// src/kka/kka.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { KkaService } from './kka.service';
import {
  CreateKkaSchema,
  UpdateKkaSchema,
  UpdateKkaStatusSchema,
  CreateKkaDto,
  UpdateKkaDto,
  UpdateKkaStatusDto,
} from './dto/kka.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ContextualAuthGuard } from '../common/guards/contextual-auth.guard';

@Controller('api/v1/kka')
@UseGuards(ContextualAuthGuard) // Melindungi seluruh endpoint KKA via Contextual Guard
export class KkaController {
  constructor(private readonly kkaService: KkaService) {}

  /**
   * POST /api/v1/kka
   * Membuat KKA baru.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ZodValidationPipe(CreateKkaSchema)) dto: CreateKkaDto) {
    return this.kkaService.createKka(dto);
  }

  /**
   * PUT /api/v1/kka/:id
   * Mengupdate konten isi KKA.
   */
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateKkaSchema)) dto: UpdateKkaDto,
  ) {
    return this.kkaService.updateKka(id, dto);
  }

  /**
   * PATCH /api/v1/kka/:id/status
   * Transisi status KKA (State Machine).
   */
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateKkaStatusSchema)) dto: UpdateKkaStatusDto,
    @Req() req: any,
  ) {
    // req.userTeamRole diisi otomatis oleh ContextualAuthGuard (Gate 2)
    const roleInTeam = req.userTeamRole;
    return this.kkaService.updateStatus(id, dto.statusKka, roleInTeam);
  }

  /**
   * GET /api/v1/kka
   * List all KKA.
   */
  @Get()
  findAll() {
    return this.kkaService.findAll();
  }

  /**
   * GET /api/v1/kka/:id
   * Detail KKA.
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.kkaService.findOne(id);
  }

  /**
   * DELETE /api/v1/kka/:id
   * Menghapus KKA.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.kkaService.delete(id);
  }
}
