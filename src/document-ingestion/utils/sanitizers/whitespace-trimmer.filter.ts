// src/document-ingestion/utils/sanitizers/whitespace-trimmer.filter.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class WhitespaceTrimmerFilter {
  filter(text: string): string {
    if (!text) return '';
    
    return text
      // Ubah carriage return (\r) menjadi LF (\n)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Bersihkan tabulasi dan spasi ganda horizontal
      .replace(/[ \t]+/g, ' ')
      // Bersihkan baris kosong berlebih (maksimal 2 newlines berturut-turut)
      .replace(/\n{3,}/g, '\n\n')
      // Bersihkan spasi di awal/akhir tiap baris
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
  }
}
