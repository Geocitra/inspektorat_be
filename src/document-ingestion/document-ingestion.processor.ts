// src/document-ingestion/document-ingestion.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DocumentRepository } from './repositories/document.repository';
import { ParserFactory } from './parsers/parser.factory';
import { TextSanitizerPipeline } from './utils/sanitizers/text-sanitizer.pipeline';
import { SemanticChunkerService } from './services/semantic-chunker.service';
import { EmbeddingBatchProcessor } from './utils/embedding-batch-processor.util';
import { DocumentType } from '@prisma/client';
import * as fsPromises from 'fs/promises';

export interface IngestionJobData {
    title: string;
    type: DocumentType;
    filePath: string;
    dbRelativePath: string;
    mimeType: string;
    originalName: string;
    fileSize: number;
    hash: string;
    opdId?: string | null;
}

@Processor('document_ingestion')
export class DocumentIngestionProcessor extends WorkerHost {
    private readonly logger = new Logger(DocumentIngestionProcessor.name);

    constructor(
        private readonly documentRepository: DocumentRepository,
        private readonly parserFactory: ParserFactory,
        private readonly sanitizerPipeline: TextSanitizerPipeline,
        private readonly chunkerService: SemanticChunkerService,
        private readonly batchProcessor: EmbeddingBatchProcessor,
    ) {
        super();
    }

    async process(job: Job<IngestionJobData, any, string>): Promise<any> {
        const {
            title,
            type,
            filePath,
            dbRelativePath,
            mimeType,
            originalName,
            fileSize,
            hash,
            opdId,
        } = job.data;

        this.logger.log(`[Job ${job.id}] Memulai pemrosesan AI Ingestion untuk dokumen: ${originalName}`);

        try {
            let rawText = '';
            try {
                const buffer = await fsPromises.readFile(filePath);

                const ext = originalName.split('.').pop()?.toLowerCase() || '';
                const parser = this.parserFactory.getParser(mimeType, ext);

                this.logger.log(`[Job ${job.id}] Mengekstrak teks menggunakan parser (.${ext})...`);
                rawText = await parser.parse(buffer);
            } catch (parseError: any) {
                this.logger.error(`[Job ${job.id}] GAGAL mengekstrak teks (Permanent Error): ${parseError.message}`);
                await job.discard(); // Hentikan retries
                throw parseError;
            }

            const cleanedText = this.sanitizerPipeline.sanitize(rawText);

            const chunks = this.chunkerService.chunkText(cleanedText);
            if (chunks.length === 0) {
                this.logger.error(`[Job ${job.id}] GAGAL memproses (Permanent Error): Dokumen tidak mengandung teks atau non-OCR.`);
                await job.discard(); // Hentikan retries
                throw new Error('Dokumen tidak mengandung teks yang dapat diekstrak atau dokumen berupa hasil scan (non-OCR).');
            }
            this.logger.log(`[Job ${job.id}] Berhasil memecah teks menjadi ${chunks.length} chunks.`);

            this.logger.log(`[Job ${job.id}] Mengirim chunks ke API OpenAI/Ollama...`);
            const embeddings = await this.batchProcessor.processInBatches(chunks);

            const chunkData = chunks.map((content, idx) => ({
                chunkIndex: idx,
                content,
                embedding: embeddings[idx],
            }));

            this.logger.log(`[Job ${job.id}] Menyimpan ${chunks.length} vektor ke PostgreSQL...`);
            const savedDoc = await this.documentRepository.saveIngestedDocument(
                {
                    title,
                    type,
                    filePath: dbRelativePath,
                    status: 'AKTIF',
                    opdId: opdId || undefined,
                },
                {
                    fileSize,
                    mimeType,
                    totalChunks: chunks.length,
                    hash,
                },
                chunkData,
            );

            this.logger.log(`[Job ${job.id}] SELESAI ✅ Dokumen (ID: ${savedDoc.id}) telah diindeks di Knowledge Base.`);

            return {
                success: true,
                documentId: savedDoc.id,
                chunksProcessed: chunks.length
            };

        } catch (error: any) { // [FIX] Typecasting ke any
            this.logger.error(`[Job ${job.id}] GAGAL memproses dokumen: ${error.message}`);
            throw error;
        }
    }
}