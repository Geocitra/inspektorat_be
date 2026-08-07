// src/document-ingestion/parsers/pdf-parser.adapter.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DocumentParser } from './document-parser.interface';
import * as pdfParse from 'pdf-parse';

@Injectable()
export class PdfParserAdapter implements DocumentParser {
  async parse(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (error) {
      throw new InternalServerErrorException(
        `Gagal mengurai berkas PDF: ${error.message}`,
      );
    }
  }
}
