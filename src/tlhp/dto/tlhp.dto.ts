// src/tlhp/dto/tlhp.dto.ts
import { z } from 'zod';

export const HasilVerifikasiEnum = z.enum(['SESUAI', 'BELUM_SESUAI']);

export const CreateTindakLanjutSchema = z.object({
  rekomendasiId: z
    .string({ required_error: 'Rekomendasi ID wajib diisi' })
    .uuid('Format Rekomendasi ID tidak valid'),
  uraianTindakan: z
    .string({ required_error: 'Uraian tindakan wajib diisi' })
    .min(5, 'Uraian tindakan terlalu pendek'),
});

export const CreateVerifikasiSchema = z.object({
  verifikatorId: z
    .string({ required_error: 'ID Verifikator wajib diisi' })
    .uuid('Format ID Verifikator tidak valid'),
  catatanVerifikator: z
    .string({ required_error: 'Catatan verifikator wajib diisi' })
    .min(5, 'Catatan verifikator terlalu pendek'),
  hasilVerifikasi: HasilVerifikasiEnum,
});

export const LockFindingSchema = z.object({
  actorId: z
    .string({ required_error: 'ID Aktor wajib diisi' })
    .uuid('Format ID Aktor tidak valid'),
});

export type CreateTindakLanjutDto = z.infer<typeof CreateTindakLanjutSchema>;
export type CreateVerifikasiDto = z.infer<typeof CreateVerifikasiSchema>;
export type LockFindingDto = z.infer<typeof LockFindingSchema>;
