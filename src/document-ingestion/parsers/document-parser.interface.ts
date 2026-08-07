// src/document-ingestion/parsers/document-parser.interface.ts
export interface DocumentParser {
  parse(buffer: Buffer): Promise<string>;
}
