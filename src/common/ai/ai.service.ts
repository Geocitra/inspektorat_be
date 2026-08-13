// src/common/ai/ai.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI;
  private readonly openaiModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({ apiKey });
    this.openaiModel = this.configService.get<string>(
      'OPENAI_MODEL',
      'gpt-5.4-mini', // Menyesuaikan dengan standar proyek Anda
    );
  }

  /**
   * Menghasilkan embeddings 1536-dimensi menggunakan model text-embedding-3-small dari OpenAI.
   * [REFACTOR] Menghapus fallback deterministik (Math.sin) untuk mencegah Vector Poisoning.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.replace(/\n/g, ' '),
      });

      const embedding = response.data[0]?.embedding;
      if (embedding && embedding.length === 1536) {
        return embedding;
      }

      throw new Error('API merespons namun dimensi embedding tidak valid (bukan 1536).');
    } catch (err: any) { // [FIX] Menambahkan Typecasting : any
      // Fail Fast: Lempar error agar ditangkap oleh mekanisme Retry BullMQ
      this.logger.error(`Gagal menghasilkan vector embedding: ${err.message}`);
      throw new InternalServerErrorException('Layanan AI Embedding sedang tidak tersedia atau mengalami gangguan (Timeout/Rate Limit).');
    }
  }

  /**
   * Mengirim system prompt dan user prompt ke OpenAI untuk melahirkan respon RAG.
   * [REFACTOR] Menghapus fallback statis agar sistem tidak berhalusinasi saat offline.
   */
  async generateChatCompletion(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0, // Suhu 0 untuk output deterministik & faktual
      });

      return response.choices[0]?.message?.content || '';
    } catch (err: any) { // [FIX] Menambahkan Typecasting : any
      // Fail Fast: Lempar error untuk di-handle oleh caller (Service/Queue)
      this.logger.error(`Gagal menghasilkan Chat Completion (RAG): ${err.message}`);
      throw new InternalServerErrorException('Layanan AI Chat Completion sedang tidak dapat diproses.');
    }
  }
}