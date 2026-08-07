// src/document-ingestion/utils/embedding-batch-processor.util.ts
import { Injectable, Logger } from '@nestjs/common';
import { ExternalEmbeddingAdapter } from '../providers/external-embedding.adapter';

@Injectable()
export class EmbeddingBatchProcessor {
  private readonly logger = new Logger(EmbeddingBatchProcessor.name);

  constructor(private readonly embeddingAdapter: ExternalEmbeddingAdapter) {}

  /**
   * Memproses daftar chunks secara batching untuk mendapatkan embedding masing-masing.
   * Mengembalikan array dari Float[] (vektor).
   */
  async processInBatches(
    chunks: string[],
    batchSize = 20,
  ): Promise<number[][]> {
    const results: number[][] = [];
    this.logger.log(`Memulai pemrosesan batching embedding untuk ${chunks.length} chunks (Ukuran batch: ${batchSize}).`);

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      this.logger.log(`Memproses batch ${Math.floor(i / batchSize) + 1} (${batch.length} chunks)...`);

      // Jalankan pemanggilan embedding secara paralel dalam satu batch
      const batchPromises = batch.map((chunk) =>
        this.embeddingAdapter.generateEmbedding(chunk),
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    this.logger.log('Seluruh batch embedding berhasil diproses.');
    return results;
  }
}
