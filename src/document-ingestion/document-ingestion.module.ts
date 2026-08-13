// src/document-ingestion/document-ingestion.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentIngestionController } from './document-ingestion.controller';
import { DocumentIngestionService } from './services/document-ingestion.service';
import { DocumentIngestionProcessor } from './document-ingestion.processor';
import { DocumentRepository } from './repositories/document.repository';
import { SemanticChunkerService } from './services/semantic-chunker.service';
import { ParserFactory } from './parsers/parser.factory';
import { PdfParserAdapter } from './parsers/pdf-parser.adapter';
import { DocxParserAdapter } from './parsers/docx-parser.adapter';
import { TxtParserAdapter } from './parsers/txt-parser.adapter';
import { XlsxParserAdapter } from './parsers/xlsx-parser.adapter';
import { UnicodeNormalizerFilter } from './utils/sanitizers/unicode-normalizer.filter';
import { WhitespaceTrimmerFilter } from './utils/sanitizers/whitespace-trimmer.filter';
import { TextSanitizerPipeline } from './utils/sanitizers/text-sanitizer.pipeline';
import { ExternalEmbeddingAdapter } from './providers/external-embedding.adapter';
import { EmbeddingBatchProcessor } from './utils/embedding-batch-processor.util';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'document_ingestion',
    }),
  ],
  controllers: [DocumentIngestionController],
  providers: [
    DocumentIngestionService,
    DocumentIngestionProcessor,
    DocumentRepository,
    SemanticChunkerService,
    ParserFactory,
    PdfParserAdapter,
    DocxParserAdapter,
    TxtParserAdapter,
    XlsxParserAdapter,
    UnicodeNormalizerFilter,
    WhitespaceTrimmerFilter,
    TextSanitizerPipeline,
    ExternalEmbeddingAdapter,
    EmbeddingBatchProcessor,
  ],
  // [REFACTOR] Menambahkan ParserFactory ke exports agar bisa digunakan di AuditPlanningModule
  exports: [
    DocumentIngestionService,
    DocumentRepository,
    ExternalEmbeddingAdapter,
    ParserFactory
  ],
})
export class DocumentIngestionModule { }