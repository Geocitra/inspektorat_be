// src/common/crypto/crypto.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12; // Standard IV length for GCM is 12 bytes
  private readonly TAG_LENGTH = 16; // Standard tag length for GCM is 16 bytes

  constructor(private readonly configService: ConfigService) {
    // Membaca key dari env, pastikan panjangnya 32 bytes (256 bits).
    // Jika tidak ada, gunakan fallback key yang aman berukuran 32 bytes.
    const rawKey = this.configService.get<string>(
      'WBS_CRYPTO_KEY',
      'apip_suite_super_secret_key_32_bytes_long!!',
    );
    this.key = Buffer.from(rawKey.substring(0, 32));
  }

  /**
   * Mengenkripsi teks string menggunakan AES-256-GCM.
   * Mengembalikan string terenkripsi dengan format iv:authTag:ciphertext (dalam format hex).
   */
  encryptText(plainText: string): string {
    if (!plainText) return '';
    
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.key, iv);
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Mendekripsi teks string terenkripsi berformat iv:authTag:ciphertext.
   */
  decryptText(encryptedText: string): string {
    if (!encryptedText) return '';
    
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Format teks terenkripsi WBS tidak valid (harus 3 segmen).');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Mengenkripsi data buffer berkas fisik biner menggunakan AES-256-GCM.
   * Menyimpan IV dan AuthTag di awal buffer hasil enkripsi: [IV (12B)][TAG (16B)][CIPHERTEXT...]
   */
  encryptBuffer(buffer: Buffer): Buffer {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.key, iv);
    
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Satukan IV, Tag, dan Encrypted bytes menjadi satu buffer tunggal
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Mendekripsi data buffer berkas fisik biner yang terenkripsi.
   */
  decryptBuffer(encryptedBuffer: Buffer): Buffer {
    if (encryptedBuffer.length < this.IV_LENGTH + this.TAG_LENGTH) {
      throw new Error('Ukuran buffer terenkripsi terlalu kecil.');
    }
    
    // Ekstrak IV dan AuthTag dari awal buffer
    const iv = encryptedBuffer.subarray(0, this.IV_LENGTH);
    const authTag = encryptedBuffer.subarray(this.IV_LENGTH, this.IV_LENGTH + this.TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(this.IV_LENGTH + this.TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Membuat Token Pelacakan acak non-sekuensial untuk aduan WBS.
   * Format: WBS-YYYY-XXXXXXXXXX (Contoh: WBS-2026-X98A2B11FF)
   */
  generateWbsToken(): string {
    const year = new Date().getFullYear();
    // Menggenerasikan 10 karakter acak uppercase alphanumeric
    const randomHex = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `WBS-${year}-${randomHex}`;
  }
}
