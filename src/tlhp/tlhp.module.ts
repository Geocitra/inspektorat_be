// src/tlhp/tlhp.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TlhpService } from './tlhp.service';
import { TlhpController } from './tlhp.controller';
import { TlhpProcessor } from './tlhp.processor';
import { AiModule } from '../common/ai/ai.module';
import { DocumentIngestionModule } from '../document-ingestion/document-ingestion.module';
import { AddendumValidatorService } from './services/addendum-validator.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'compliance_calculation',
    }),
    AiModule,                 // Menyediakan akses ke model bahasa (LLM)
    DocumentIngestionModule,  // Menyediakan akses ke RAG kueri regulasi global
  ],
  controllers: [TlhpController],
  providers: [
    TlhpService,
    TlhpProcessor,
    AddendumValidatorService, // AI Agent Pengevaluasi Keabsahan Adendum (Fase 6)
  ],
  exports: [TlhpService, AddendumValidatorService],
})
export class TlhpModule { }