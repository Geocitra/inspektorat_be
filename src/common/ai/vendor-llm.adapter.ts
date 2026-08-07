// src/common/ai/vendor-llm.adapter.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jsonrepair } from 'jsonrepair';

@Injectable()
export class VendorLlmAdapter {
  private readonly logger = new Logger(VendorLlmAdapter.name);
  private readonly ollamaUrl: string;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    this.ollamaUrl = this.configService.get<string>(
      'OLLAMA_URL',
      'http://localhost:11434',
    );
    this.defaultModel = this.configService.get<string>(
      'OLLAMA_CHAT_MODEL',
      'llama3',
    );
  }

  /**
   * Mengirim permintaan Chat Completion ke Local LLM dengan validasi & pemulihan JSON
   */
  async callLlm(
    systemPrompt: string,
    userPrompt: string,
    options?: { model?: string; temperature?: number; jsonMode?: boolean },
  ): Promise<string> {
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0; // Default 0 untuk mencegah halusinasi
    const jsonMode = options?.jsonMode ?? false;

    try {
      const requestBody: any = {
        model,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        options: {
          temperature,
        },
      };

      if (jsonMode) {
        requestBody.format = 'json';
      }

      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }

      const result = await response.json();
      let outputText = result.response || '';

      if (jsonMode) {
        outputText = this.healJson(outputText);
      }

      return outputText;
    } catch (error) {
      this.logger.error(`Gagal menghubungi server LLM Lokal (${this.ollamaUrl}): ${error.message}`);
      throw error;
    }
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
