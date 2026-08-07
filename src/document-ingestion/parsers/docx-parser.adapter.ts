// src/document-ingestion/parsers/docx-parser.adapter.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DocumentParser } from './document-parser.interface';
import * as mammoth from 'mammoth';

@Injectable()
export class DocxParserAdapter implements DocumentParser {
  async parse(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (error) {
      throw new InternalServerErrorException(
        `Gagal mengurai berkas DOCX: ${error.message}`,
      );
    }
  }
}
