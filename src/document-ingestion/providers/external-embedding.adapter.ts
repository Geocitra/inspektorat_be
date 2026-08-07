// src/document-ingestion/providers/external-embedding.adapter.ts
import { Injectable } from '@nestjs/common';
import { AiService } from '../../common/ai/ai.service';

@Injectable()
export class ExternalEmbeddingAdapter {
  constructor(private readonly aiService: AiService) {}

  /**
   * Menghasilkan vektor embedding 1536-dimensi untuk pecahan teks.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.aiService.generateEmbedding(text);
  }
}
