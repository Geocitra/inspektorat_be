// src/kka/dto/kka.dto.ts
import { z } from 'zod';

export const StatusKkaEnum = z.enum(['DRAF', 'MENUNGGU_ULASAN', 'APPROVED', 'REVISI']);

export const CreateKkaSchema = z.object({
  stId: z
    .string({ required_error: 'Surat Tugas ID wajib diisi' })
    .uuid('Format Surat Tugas ID tidak valid'),
  pkaId: z
    .string()
    .uuid('Format PKA ID tidak valid')
    .optional()
    .nullable(),
  prosedurPemeriksaan: z
    .string({ required_error: 'Prosedur pemeriksaan wajib diisi' })
    .min(5, 'Prosedur pemeriksaan terlalu pendek'),
  uraianPengujian: z
    .string({ required_error: 'Uraian pengujian wajib diisi' })
    .min(5, 'Uraian pengujian terlalu pendek'),
  kesimpulanSementara: z
    .string({ required_error: 'Kesimpulan sementara wajib diisi' })
    .min(5, 'Kesimpulan sementara terlalu pendek'),
});

export const UpdateKkaSchema = CreateKkaSchema.partial();

export const UpdateKkaStatusSchema = z.object({
  statusKka: StatusKkaEnum,
});

export type CreateKkaDto = z.infer<typeof CreateKkaSchema>;
export type UpdateKkaDto = z.infer<typeof UpdateKkaSchema>;
export type UpdateKkaStatusDto = z.infer<typeof UpdateKkaStatusSchema>;
