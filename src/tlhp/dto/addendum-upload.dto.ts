// src/tlhp/dto/addendum-upload.dto.ts
import { z } from 'zod';

export const UploadAddendumSchema = z.object({
    catatanJustifikasi: z
        .string({ required_error: 'Catatan justifikasi tindak lanjut wajib diisi.' })
        .min(10, 'Justifikasi dari OPD terlalu pendek (minimal 10 karakter).')
        .max(2000, 'Justifikasi dari OPD maksimal 2000 karakter.'),
});

export type UploadAddendumDto = z.infer<typeof UploadAddendumSchema>;