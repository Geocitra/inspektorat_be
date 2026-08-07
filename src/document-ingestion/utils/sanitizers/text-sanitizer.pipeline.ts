// src/document-ingestion/utils/sanitizers/text-sanitizer.pipeline.ts
import { Injectable } from '@nestjs/common';
import { UnicodeNormalizerFilter } from './unicode-normalizer.filter';
import { WhitespaceTrimmerFilter } from './whitespace-trimmer.filter';

@Injectable()
export class TextSanitizerPipeline {
  constructor(
    private readonly unicodeNormalizer: UnicodeNormalizerFilter,
    private readonly whitespaceTrimmer: WhitespaceTrimmerFilter,
  ) {}

  sanitize(text: string): string {
    if (!text) return '';
    let result = text;
    result = this.unicodeNormalizer.filter(result);
    result = this.whitespaceTrimmer.filter(result);
    return result;
  }
}
