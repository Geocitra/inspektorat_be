// src/document-ingestion/utils/sanitizers/unicode-normalizer.filter.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class UnicodeNormalizerFilter {
  filter(text: string): string {
    if (!text) return '';
    // Gunakan normalisasi NFC (Normalization Form Canonical Composition)
    // untuk membersihkan karakter unicode gabungan/bersarang.
    return text.normalize('NFC');
  }
}
