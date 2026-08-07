// src/document-ingestion/document-ingestion.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentIngestionController } from './document-ingestion.controller';
import { DocumentIngestionService } from './services/document-ingestion.service';
import { DocumentRepository } from './repositories/document.repository';
import { SemanticChunkerService } from './services/semantic-chunker.service';
import { ParserFactory } from './parsers/parser.factory';
import { PdfParserAdapter } from './parsers/pdf-parser.adapter';
import { DocxParserAdapter } from './parsers/docx-parser.adapter';
import { TxtParserAdapter } from './parsers/txt-parser.adapter';
import { UnicodeNormalizerFilter } from './utils/sanitizers/unicode-normalizer.filter';
import { WhitespaceTrimmerFilter } from './utils/sanitizers/whitespace-trimmer.filter';
import { TextSanitizerPipeline } from './utils/sanitizers/text-sanitizer.pipeline';
import { ExternalEmbeddingAdapter } from './providers/external-embedding.adapter';
import { EmbeddingBatchProcessor } from './utils/embedding-batch-processor.util';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentIngestionController],
  providers: [
    DocumentIngestionService,
    DocumentRepository,
    SemanticChunkerService,
    ParserFactory,
    PdfParserAdapter,
    DocxParserAdapter,
    TxtParserAdapter,
    UnicodeNormalizerFilter,
    WhitespaceTrimmerFilter,
    TextSanitizerPipeline,
    ExternalEmbeddingAdapter,
    EmbeddingBatchProcessor,
  ],
  exports: [DocumentIngestionService, DocumentRepository, ExternalEmbeddingAdapter],
})
export class DocumentIngestionModule {}
