// src/wbs/dto/wbs.dto.ts
import { z } from 'zod';

export const KeputusanTriageEnum = z.enum([
  'Klarifikasi_Dibutuhkan',
  'Diarsipkan_Tolak',
  'Rekomendasi_Audit',
]);

export const CreateWbsAduanSchema = z.object({
  kategori: z
    .string({ required_error: 'Kategori aduan wajib diisi' })
    .min(3, 'Kategori aduan terlalu pendek'),
  deskripsi: z
    .string({ required_error: 'Deskripsi aduan wajib diisi' })
    .min(10, 'Deskripsi aduan terlalu pendek'),
});

export const TriageComplaintSchema = z.object({
  keputusan: KeputusanTriageEnum,
  catatanPenelaah: z
    .string({ required_error: 'Catatan penelaah wajib diisi' })
    .min(5, 'Catatan terlalu pendek'),
  penelaahId: z
    .string({ required_error: 'ID Penelaah wajib diisi' })
    .uuid('Format ID Penelaah tidak valid'),
});

export const SendChatSchema = z.object({
  sender: z.enum(['Investigator', 'Whistleblower']),
  pesan: z
    .string({ required_error: 'Pesan wajib diisi' })
    .min(1, 'Pesan tidak boleh kosong'),
  tokenPelacakan: z.string().optional(), // Hanya untuk Whistleblower
});

export const ApproveRekomendasiSchema = z.object({
  approvedById: z
    .string({ required_error: 'ID Inspektur penyetuju wajib diisi' })
    .uuid('Format ID Inspektur tidak valid'),
  nomorSt: z
    .string({ required_error: 'Nomor Surat Tugas wajib diisi' })
    .min(5, 'Nomor Surat Tugas terlalu pendek'),
  tanggalMulai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggalMulai harus YYYY-MM-DD'),
  tanggalSelesai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggalSelesai harus YYYY-MM-DD'),
  auditors: z
    .array(
      z.object({
        auditorId: z.string().uuid('Format ID Auditor tidak valid'),
        peranDalamTim: z.enum(['Pengawas_Teknis', 'Ketua_Tim', 'Anggota_Tim']),
      }),
    )
    .min(1, 'Tim Auditor minimal terdiri dari 1 orang'),
});

export type CreateWbsAduanDto = z.infer<typeof CreateWbsAduanSchema>;
export type TriageComplaintDto = z.infer<typeof TriageComplaintSchema>;
export type SendChatDto = z.infer<typeof SendChatSchema>;
export type ApproveRekomendasiDto = z.infer<typeof ApproveRekomendasiSchema>;
