// src/kka/kka.module.ts
import { Module } from '@nestjs/common';
import { KkaService } from './kka.service';
import { KkaController } from './kka.controller';
import { AiModule } from '../common/ai/ai.module';
import { DocumentIngestionModule } from '../document-ingestion/document-ingestion.module';

@Module({
  imports: [
    AiModule,                 // Menyediakan akses ke AiService & VendorLlmAdapter untuk pengolahan LLM
    DocumentIngestionModule,  // Menyediakan akses ke DocumentRepository & Ingestion untuk pencarian RAG semantik
  ],
  controllers: [KkaController],
  providers: [KkaService],
  exports: [KkaService],
})
export class KkaModule { }