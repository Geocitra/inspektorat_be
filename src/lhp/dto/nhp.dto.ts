// src/lhp/dto/nhp.dto.ts
import { z } from 'zod';

export const GenerateNhpSchema = z.object({
    stId: z
        .string({ required_error: 'ID Surat Tugas wajib diisi' })
        .uuid('Format ID Surat Tugas tidak valid (wajib UUID)'),
});

export const UploadFeedbackSchema = z.object({
    catatanJustifikasi: z
        .string()
        .max(2000, 'Catatan justifikasi tambahan maksimal 2000 karakter')
        .optional()
        .nullable(),
});

export type GenerateNhpDto = z.infer<typeof GenerateNhpSchema>;
export type UploadFeedbackDto = z.infer<typeof UploadFeedbackSchema>;