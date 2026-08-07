import { Module } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { AssignmentController } from './assignment.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../common/ai/ai.module';
import { DocumentIngestionModule } from '../document-ingestion/document-ingestion.module';
import { TeamAllocationService } from './services/team-allocation.service';
import { PkaGeneratorService } from './services/pka-generator.service';

@Module({
  imports: [PrismaModule, AiModule, DocumentIngestionModule],
  controllers: [AssignmentController],
  providers: [AssignmentService, TeamAllocationService, PkaGeneratorService],
  exports: [AssignmentService, TeamAllocationService, PkaGeneratorService],
})
export class AssignmentModule {}
