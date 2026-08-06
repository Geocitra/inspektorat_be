// src/common/sanitize/sanitize.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class SanitizeService {
  /**
   * Menyaring data pribadi, nama dinas/OPD/badan, dan informasi sensitif dari teks
   * sebelum dipublikasikan ke Knowledge Management System (KMS) publik.
   */
  sanitizeText(text: string): string {
    if (!text) return '';

    let sanitized = text;

    // 1. Saring Nama OPD & Nomenklatur Birokrasi Daerah (Dinas, Badan, Kantor, Sekretariat, Kecamatan, Kelurahan, Inspektorat)
    sanitized = sanitized.replace(
      /(?:Dinas|Badan|Kantor|Sekretariat|Kecamatan|Kelurahan|Inspektorat)\s+[A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)*/gi,
      '[OPD Terkait]',
    );

    // 2. Saring NIP (18 digit angka berurutan)
    sanitized = sanitized.replace(/\b\d{18}\b/g, '[NIP SENSOR]');

    // 3. Saring Nama Personal dengan gelar kehormatan akademis/keagamaan (Bapak, Ibu, Sdr, Sdri, Bpk, H., Hj., Dr., Ir., Drs.)
    sanitized = sanitized.replace(
      /(?:Bapak|Ibu|Sdr|Sdri|Bpk|H\.|Hj\.|Dr\.|Ir\.|Drs\.)\s+[A-Za-z]+(?:\s+[A-Za-z]+)*/gi,
      '[Pejabat/Pihak Terkait]',
    );

    // 4. Saring Nomor Telepon/HP Indonesia (format lokal: 08xx atau internasional: 628xx)
    sanitized = sanitized.replace(/\b(?:08|628)\d{8,11}\b/g, '[NOMOR TELEPON SENSOR]');

    // 5. Saring alamat email
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g, '[EMAIL SENSOR]');

    return sanitized;
  }
}
