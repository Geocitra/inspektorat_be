// src/lhp/lhp.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LhpService } from './lhp.service';
import { LhpController } from './lhp.controller';
import { LhpProcessor } from './lhp.processor';
import { AiModule } from '../common/ai/ai.module';
import { DocumentIngestionModule } from '../document-ingestion/document-ingestion.module';
import { NhpGeneratorService } from './services/nhp-generator.service';
import { FeedbackAnalyzerService } from './services/feedback-analyzer.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'lhp_generation',
    }),
    AiModule,                 // Akses ke LLM Adapter (Fase 5)
    DocumentIngestionModule,  // Akses ke pencarian semantik regulasi global (RAG)
  ],
  controllers: [LhpController],
  providers: [
    LhpService,
    LhpProcessor,
    NhpGeneratorService,      // AI Agent Penyusun NHP (Fase 5)
    FeedbackAnalyzerService,  // AI Agent Pengevaluasi Tanggapan OPD (Fase 5)
  ],
  exports: [LhpService, NhpGeneratorService, FeedbackAnalyzerService],
})
export class LhpModule { }