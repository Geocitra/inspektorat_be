// src/document-ingestion/parsers/txt-parser.adapter.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DocumentParser } from './document-parser.interface';

@Injectable()
export class TxtParserAdapter implements DocumentParser {
  async parse(buffer: Buffer): Promise<string> {
    try {
      return buffer.toString('utf-8');
    } catch (error) {
      throw new InternalServerErrorException(
        `Gagal mengurai berkas teks: ${error.message}`,
      );
    }
  }
}
