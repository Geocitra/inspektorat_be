// scratch/read_references.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PdfParserAdapter } from '../src/document-ingestion/parsers/pdf-parser.adapter';
import { XlsxParserAdapter } from '../src/document-ingestion/parsers/xlsx-parser.adapter';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  console.log('=== MEMULAI MEMBACA DOKUMEN REFERENSI PKPT ===');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const pdfParser = app.get(PdfParserAdapter);
  const xlsxParser = app.get(XlsxParserAdapter);

  const pdfPath = 'C:/Users/PC/Documents/Dev/inspektorat/docs/references/PKPT 2025 lampiran 14 tahun 2025.pdf';
  const xlsxPath = 'C:/Users/PC/Documents/Dev/inspektorat/docs/references/PKPT 2025 lampiran 14 tahun 2025.xlsx';

  try {
    // 1. Membaca PDF
    if (fs.existsSync(pdfPath)) {
      console.log(`Reading PDF: ${pdfPath}...`);
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfText = await pdfParser.parse(pdfBuffer);
      fs.writeFileSync('scratch/extracted_pkpt_text.txt', pdfText);
      console.log('-> Saved PDF text to scratch/extracted_pkpt_text.txt');
    } else {
      console.warn(`PDF not found at: ${pdfPath}`);
    }

    // 2. Membaca Excel (XLSX)
    if (fs.existsSync(xlsxPath)) {
      console.log(`Reading XLSX: ${xlsxPath}...`);
      const xlsxBuffer = fs.readFileSync(xlsxPath);
      const xlsxText = await xlsxParser.parse(xlsxBuffer);
      fs.writeFileSync('scratch/extracted_pkpt_xlsx.txt', xlsxText);
      console.log('-> Saved XLSX text to scratch/extracted_pkpt_xlsx.txt');
    } else {
      console.warn(`XLSX not found at: ${xlsxPath}`);
    }

    console.log('=== MEMBACA DOKUMEN SELESAI ===');
  } catch (error: any) {
    console.error('Error reading documents:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
