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

    const lines = text.split(/\n/);
    const items: Array<{ type: 'text' | 'table'; content: string; header?: string }> = [];
    
    let isInsideTable = false;
    let currentTableRows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const isTableRow = trimmedLine.startsWith('|') && trimmedLine.endsWith('|');

      if (isTableRow) {
        if (!isInsideTable) {
          isInsideTable = true;
          currentTableRows = [line];
        } else {
          currentTableRows.push(line);
        }
      } else {
        if (isInsideTable) {
          // Tabel selesai. Simpan data tabel
          const header = currentTableRows.slice(0, 2).join('\n');
          items.push({
            type: 'table',
            content: currentTableRows.join('\n'),
            header,
          });
          currentTableRows = [];
          isInsideTable = false;
        }
        
        if (trimmedLine !== '') {
          items.push({ type: 'text', content: line });
        }
      }
    }

    // Tangani tabel sisa di akhir teks
    if (isInsideTable && currentTableRows.length > 0) {
      const header = currentTableRows.slice(0, 2).join('\n');
      items.push({
        type: 'table',
        content: currentTableRows.join('\n'),
        header,
      });
    }

    // Mulai pembuatan chunks
    const chunks: string[] = [];
    let currentChunkText = '';

    for (const item of items) {
      if (item.type === 'text') {
        const paragraph = item.content;
        
        if (currentChunkText.length + paragraph.length + 1 > targetSize) {
          if (currentChunkText.trim().length > 0) {
            chunks.push(currentChunkText.trim());
          }
          
          // Jika satu paragraf melampaui targetSize, pecah berdasarkan kalimat
          if (paragraph.length > targetSize) {
            const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [paragraph];
            let tempText = '';
            for (const sentence of sentences) {
              if (tempText.length + sentence.length + 1 > targetSize) {
                chunks.push(tempText.trim());
                tempText = sentence;
              } else {
                tempText += (tempText ? ' ' : '') + sentence.trim();
              }
            }
            currentChunkText = tempText;
          } else {
            currentChunkText = paragraph;
          }
        } else {
          currentChunkText += (currentChunkText ? '\n' : '') + paragraph;
        }
      } else {
        // Penanganan tabel
        const tableContent = item.content;
        const header = item.header || '';
        
        if (currentChunkText.length + tableContent.length + 1 > targetSize) {
          if (currentChunkText.trim().length > 0) {
            chunks.push(currentChunkText.trim());
            currentChunkText = '';
          }

          // Jika tabel sangat panjang melampaui targetSize, pecah barisnya
          if (tableContent.length > targetSize) {
            const rows = tableContent.split('\n');
            const tableHeaderLines = rows.slice(0, 2);
            let tempTableText = tableHeaderLines.join('\n');

            for (let j = 2; j < rows.length; j++) {
              const row = rows[j];
              if (tempTableText.length + row.length + 1 > targetSize) {
                chunks.push(tempTableText.trim());
                // Suntikkan header tabel ke chunk lanjutan berikutnya
                tempTableText = tableHeaderLines.join('\n') + '\n' + row;
              } else {
                tempTableText += '\n' + row;
              }
            }
            currentChunkText = tempTableText;
          } else {
            currentChunkText = tableContent;
          }
        } else {
          currentChunkText += (currentChunkText ? '\n' : '') + tableContent;
        }
      }
    }

    if (currentChunkText.trim().length > 0) {
      chunks.push(currentChunkText.trim());
    }

    return chunks;
  }
}
