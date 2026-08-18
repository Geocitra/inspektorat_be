// src/common/ai/vendor-llm.adapter.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jsonrepair } from 'jsonrepair';
import OpenAI from 'openai';

@Injectable()
export class VendorLlmAdapter {
  private readonly logger = new Logger(VendorLlmAdapter.name);
  private readonly openai: OpenAI;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({ apiKey });
    this.defaultModel = this.configService.get<string>(
      'OPENAI_MODEL',
      'gpt-5.4-mini',
    );
  }

  /**
   * Mengirim permintaan Chat Completion ke OpenAI dengan validasi & pemulihan JSON
   */
  async callLlm(
    systemPrompt: string,
    userPrompt: string,
    options?: { model?: string; temperature?: number; jsonMode?: boolean },
  ): Promise<string> {
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0;
    const jsonMode = options?.jsonMode ?? false;

    try {
      const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
      };

      if (jsonMode) {
        params.response_format = { type: 'json_object' };
      }

      const response = await this.openai.chat.completions.create(params);
      let outputText = response.choices[0]?.message?.content || '';

      if (jsonMode) {
        outputText = this.healJson(outputText);
      }

      return outputText;
    } catch (error) {
      this.logger.error(`Gagal menghubungi OpenAI: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mengirim permintaan multimodal ke OpenAI (Vision) menggunakan gambar base64
   */
  async callLlmVision(
    prompt: string,
    base64Image: string,
    options?: { model?: string; temperature?: number },
    maxRetries = 4,
  ): Promise<string> {
    const model = options?.model || 'gpt-4o-mini'; // Model multimodal standard murah & kuat
    const temperature = options?.temperature ?? 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          temperature,
        });

        return response.choices[0]?.message?.content || '';
      } catch (error: any) {
        const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Rate limit');
        if (isRateLimit && attempt < maxRetries) {
          const waitMs = 1200 * Math.pow(1.8, attempt) + Math.floor(Math.random() * 500);
          this.logger.warn(`OpenAI Rate Limit 429 terdeteksi. Mencoba kembali (Attempt ${attempt + 1}/${maxRetries}) setelah ${waitMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        this.logger.error(`Gagal menghubungi OpenAI Vision (Attempt ${attempt + 1}): ${error.message}`);
        if (attempt >= maxRetries) throw error;
      }
    }

    return '';
  }

  /**
   * Memulihkan string JSON yang tidak lengkap/rusak menggunakan jsonrepair
   */
  private healJson(jsonString: string): string {
    const cleaned = jsonString.trim();
    try {
      // Coba parse secara normal dulu
      JSON.parse(cleaned);
      return cleaned;
    } catch (e) {
      this.logger.warn('Deteksi JSON rusak dari LLM. Menjalankan auto-repair...');
      try {
        const repaired = jsonrepair(cleaned);
        JSON.parse(repaired); // Pastikan hasil repair valid
        this.logger.log('JSON berhasil dipulihkan secara otomatis.');
        return repaired;
      } catch (repairError) {
        this.logger.error(`Gagal memulihkan JSON: ${repairError.message}`);
        // Kembalikan string asli, biarkan parser hilir yang menangani exception
        return cleaned;
      }
    }
  }
}
