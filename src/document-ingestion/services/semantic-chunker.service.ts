// src/document-ingestion/services/semantic-chunker.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class SemanticChunkerService {
  /**
   * Memotong teks menjadi chunks berukuran target ~2000 karakter dengan overlap 12% (~240 karakter)
   * di tingkat batas kalimat.
   */
  chunkText(text: string, targetSize = 2000, overlapPercent = 12): string[] {
    if (!text) return [];

    const overlapSize = Math.floor(targetSize * (overlapPercent / 100));
    
    // Split berdasarkan paragraf terlebih dahulu untuk menjaga koherensi
    const paragraphs = text.split(/\n+/);
    const sentences: string[] = [];

    // Jika paragraf terlalu besar atau untuk pemotongan lebih detail, kita pecah menjadi kalimat
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') continue;
      
      // Split ke kalimat menggunakan regex yang mempertahankan tanda baca kalimat akhir
      const paragraphSentences = paragraph.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [paragraph];
      for (const sentence of paragraphSentences) {
        const trimmed = sentence.trim();
        if (trimmed !== '') {
          sentences.push(trimmed);
        }
      }
    }

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      currentChunk.push(sentence);
      currentLength += sentence.length + 1; // +1 untuk spasi

      // Jika ukuran chunk saat ini sudah melampaui target
      if (currentLength >= targetSize) {
        chunks.push(currentChunk.join(' '));
        
        // Cari titik overlap: mundur dari belakang kalimat untuk mendapatkan teks overlap ~240 karakter
        let overlapLength = 0;
        const overlapSentences: string[] = [];
        
        for (let j = currentChunk.length - 1; j >= 0; j--) {
          const s = currentChunk[j];
          if (overlapLength + s.length > overlapSize) {
            break;
          }
          overlapSentences.unshift(s);
          overlapLength += s.length + 1;
        }

        currentChunk = [...overlapSentences];
        currentLength = overlapLength;
      }
    }

    // Tambahkan sisa chunk terakhir jika ada
    if (currentChunk.length > 0 && currentLength > 0) {
      const remainingText = currentChunk.join(' ').trim();
      if (remainingText.length > 10) {
        chunks.push(remainingText);
      }
    }

    return chunks;
  }
}
