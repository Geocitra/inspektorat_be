// src/document-ingestion/parsers/pdf-parser.adapter.ts
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DocumentParser } from './document-parser.interface';
import * as pdfParse from 'pdf-parse';
import { VendorLlmAdapter } from '../../common/ai/vendor-llm.adapter';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

@Injectable()
export class PdfParserAdapter implements DocumentParser {
  private readonly logger = new Logger(PdfParserAdapter.name);

  constructor(private readonly llmAdapter: VendorLlmAdapter) {}

  async parse(buffer: Buffer): Promise<string> {
    try {
      this.logger.log('Mulai parsing PDF menggunakan pdf-parse...');
      const data = await pdfParse(buffer);
      const extractedText = data.text || '';

      // Cek apakah PDF hasil scan (teks kosong atau sangat sedikit, misal < 150 karakter)
      if (extractedText.trim().length < 150) {
        this.logger.warn(
          `Hasil ekstraksi pdf-parse sangat pendek (${extractedText.trim().length} karakter). Menjalankan Multimodal AI-OCR...`
        );
        return await this.parseScannedPdf(buffer);
      }

      this.logger.log(`Berhasil mengekstrak ${extractedText.length} karakter teks dari PDF.`);
      return extractedText;
    } catch (error: any) {
      this.logger.error(`Gagal mengurai berkas PDF: ${error.message}. Mencoba fallback Multimodal AI-OCR...`);
      try {
        return await this.parseScannedPdf(buffer);
      } catch (ocrError: any) {
        throw new InternalServerErrorException(
          `Gagal mengurai berkas PDF menggunakan parser standard maupun AI-OCR: ${ocrError.message}`,
        );
      }
    }
  }

  private async parseScannedPdf(buffer: Buffer): Promise<string> {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const tempPdfPath = path.join(tempDir, `temp_ocr_${timestamp}.pdf`);
    const tempOutputDir = path.join(tempDir, `temp_ocr_out_${timestamp}`);

    try {
      // 1. Tulis buffer PDF ke file sementara
      await fs.writeFile(tempPdfPath, buffer);

      // 2. Jalankan script python untuk mengonversi PDF ke Citra JPEG
      // Tentukan path python yang benar (utamakan pythoncore 3.14 jika ada di Windows)
      let pythonCmd = 'python';
      const winPythonPath = 'C:/Users/PC/AppData/Local/Python/pythoncore-3.14-64/python.exe';
      try {
        const stat = await fs.stat(winPythonPath);
        if (stat.isFile()) {
          pythonCmd = `"${winPythonPath}"`;
        }
      } catch (e) {
        // Abaikan, gunakan 'python' default di PATH
      }

      this.logger.log(`Menjalankan script Python pdf_to_images.py menggunakan ${pythonCmd} untuk ${tempPdfPath}...`);
      const scriptPath = path.resolve('scratch/pdf_to_images.py');
      const cmd = `${pythonCmd} "${scriptPath}" "${tempPdfPath}" "${tempOutputDir}"`;
      
      const { stdout } = await execPromise(cmd);
      const result = JSON.parse(stdout.trim());

      if (result.error) {
        throw new Error(result.error);
      }

      const imageFiles: string[] = result.files;
      this.logger.log(`Python berhasil menghasilkan ${imageFiles.length} citra halaman.`);

      let combinedMarkdown = '';

      // 3. Kirim masing-masing gambar ke OpenAI Vision
      for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = imageFiles[i];
        this.logger.log(`Memproses halaman ${i + 1}/${imageFiles.length} via OpenAI Vision...`);
        
        const imageBuffer = await fs.readFile(imagePath);
        const base64Image = imageBuffer.toString('base64');

        const prompt = `Ekstrak seluruh teks dan tabel dari gambar halaman dokumen ini menjadi format Markdown yang rapi dan terstruktur.
SANGAT PENTING:
1. Jika terdapat tabel (baris dan kolom), susunlah kembali menjadi tabel Markdown yang rapi dengan format pipa (|) dan pembatas kolom (contoh: | header 1 | header 2 | \n | --- | --- |).
2. JANGAN mengubah nilai angka, tanggal, atau nama.
3. JANGAN mendeskripsikan gambar, langsung ekstrak teks dan tabelnya saja secara verbatim (apa adanya).
4. Kembalikan HANYA teks Markdown hasil ekstraksi, tanpa pembungkus blok kode markdown (\`\`\`markdown ... \`\`\`).`;

        const pageText = await this.llmAdapter.callLlmVision(prompt, base64Image);
        combinedMarkdown += `\n--- Halaman ${i + 1} ---\n${pageText.trim()}\n`;
      }

      this.logger.log('Selesai memproses seluruh halaman PDF dengan Multimodal AI-OCR.');
      return combinedMarkdown;
    } catch (error: any) {
      this.logger.error(`Proses Multimodal AI-OCR gagal: ${error.message}`);
      throw error;
    } finally {
      // 4. Bersihkan file-file sementara secara asinkron
      try {
        await fs.unlink(tempPdfPath).catch(() => {});
        await fs.rm(tempOutputDir, { recursive: true, force: true }).catch(() => {});
      } catch (cleanupError) {
        this.logger.warn(`Gagal membersihkan file temporary: ${cleanupError.message}`);
      }
    }
  }
}
