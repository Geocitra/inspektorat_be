// src/document-ingestion/parsers/parser.factory.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { DocumentParser } from './document-parser.interface';
import { PdfParserAdapter } from './pdf-parser.adapter';
import { DocxParserAdapter } from './docx-parser.adapter';
import { TxtParserAdapter } from './txt-parser.adapter';
import { XlsxParserAdapter } from './xlsx-parser.adapter'; // [REFACTOR] Import adapter baru

@Injectable()
export class ParserFactory {
  constructor(
    private readonly pdfParser: PdfParserAdapter,
    private readonly docxParser: DocxParserAdapter,
    private readonly txtParser: TxtParserAdapter,
    private readonly xlsxParser: XlsxParserAdapter, // [REFACTOR] Injeksi adapter
  ) { }

  getParser(mimeType: string, extension: string): DocumentParser {
    const ext = extension.toLowerCase();

    if (ext === 'pdf' || mimeType === 'application/pdf') {
      return this.pdfParser;
    } else if (
      ext === 'docx' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return this.docxParser;
    } else if (ext === 'txt' || mimeType === 'text/plain') {
      return this.txtParser;
    } else if (
      ext === 'xlsx' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return this.xlsxParser; // [REFACTOR] Kembalikan XlsxParser
    } else {
      throw new BadRequestException(
        `Parser tidak ditemukan untuk tipe MIME: ${mimeType} atau ekstensi: .${extension}`,
      );
    }
  }
}