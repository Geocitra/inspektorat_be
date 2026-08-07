// src/common/pipes/file-signature-validation.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class FileSignatureValidationPipe implements PipeTransform {
  // Definisikan tanda tangan biner (magic numbers) yang diperbolehkan untuk validasi tingkat rendah
  private readonly allowedSignatures = {
    pdf: [0x25, 0x50, 0x44, 0x46],        // %PDF
    zipBased: [0x50, 0x4B, 0x03, 0x04],   // PK.. (ZIP format header untuk DOCX & XLSX)
    legacyXls: [0xD0, 0xCF, 0x11, 0xE0],  // D0 CF 11 E0 (Compound File Binary Format / OLECF untuk XLS)
  };

  transform(file: any) {
    if (!file) {
      throw new BadRequestException('Berkas tidak diunggah atau tidak ditemukan.');
    }

    // Jika input adalah array dari file (multiple upload), validasi masing-masing
    if (Array.isArray(file)) {
      for (const f of file) {
        this.validateFile(f);
      }
    } else {
      this.validateFile(file);
    }

    return file;
  }

  private validateFile(file: any) {
    const buffer = file.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Berkas kosong.');
    }

    const originalName = file.originalname || '';
    const extension = originalName.split('.').pop()?.toLowerCase();

    if (!extension) {
      throw new BadRequestException('Ekstensi berkas tidak ditemukan.');
    }

    if (extension === 'pdf') {
      this.validateSignature(buffer, this.allowedSignatures.pdf, 'PDF');
    } else if (extension === 'docx') {
      this.validateSignature(buffer, this.allowedSignatures.zipBased, 'DOCX');
    } else if (extension === 'xlsx') {
      this.validateSignature(buffer, this.allowedSignatures.zipBased, 'XLSX');
    } else if (extension === 'xls') {
      this.validateSignature(buffer, this.allowedSignatures.legacyXls, 'XLS');
    } else if (extension === 'txt') {
      this.validateTextFile(buffer);
    } else {
      throw new BadRequestException(
        `Format berkas .${extension} tidak didukung. Hanya mendukung PDF, DOCX, XLSX, XLS, dan TXT.`,
      );
    }
  }

  private validateSignature(buffer: Buffer, expectedSignature: number[], type: string) {
    if (buffer.length < expectedSignature.length) {
      throw new BadRequestException(`Berkas ${type} rusak atau terlalu kecil.`);
    }

    for (let i = 0; i < expectedSignature.length; i++) {
      if (buffer[i] !== expectedSignature[i]) {
        throw new BadRequestException(
          `Validasi tanda tangan berkas ${type} gagal. Tipe berkas biner tidak cocok dengan ekstensinya.`,
        );
      }
    }
  }

  private validateTextFile(buffer: Buffer) {
    // Validasi file teks polos (TXT)
    const textSample = buffer.toString('utf-8');

    // Cek keberadaan null byte (\x00) yang menandai file biner
    if (textSample.includes('\x00')) {
      throw new BadRequestException(
        'Validasi berkas TXT gagal. Berkas terdeteksi mengandung biner/null byte.',
      );
    }

    // Periksa rasio karakter kontrol non-printable untuk mendeteksi berkas biner palsu
    let nonPrintableCount = 0;
    const len = Math.min(buffer.length, 1000);
    for (let i = 0; i < len; i++) {
      const code = buffer[i];
      // Karakter printable: 32 - 126, horizontal tab (9), line feed (10), carriage return (13)
      if (
        (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
        code === 127
      ) {
        nonPrintableCount++;
      }
    }

    if (len > 0 && nonPrintableCount / len > 0.02) {
      throw new BadRequestException(
        'Validasi berkas TXT gagal. Berkas terdeteksi mengandung banyak karakter non-printable.',
      );
    }
  }
}