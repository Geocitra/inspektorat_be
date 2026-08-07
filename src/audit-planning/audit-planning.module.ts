import { Module } from '@nestjs/common';
import { AuditPlanningService } from './audit-planning.service';
import { AuditPlanningController } from './audit-planning.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../common/ai/ai.module';
import { DocumentIngestionModule } from '../document-ingestion/document-ingestion.module';
import { RiskAssessmentService } from './services/risk-assessment.service';
import { PkptGeneratorService } from './services/pkpt-generator.service';

@Module({
  imports: [PrismaModule, AiModule, DocumentIngestionModule],
  controllers: [AuditPlanningController],
  providers: [AuditPlanningService, RiskAssessmentService, PkptGeneratorService],
  exports: [AuditPlanningService, RiskAssessmentService, PkptGeneratorService],
})
export class AuditPlanningModule {}
