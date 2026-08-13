// src/audit-planning/dto/ai-planning.dto.ts
import { z } from 'zod';

export const CalculateRiskSchema = z.object({
  tahun: z
    .number({ required_error: 'Tahun anggaran wajib diisi' })
    .int('Tahun harus berupa angka bulat')
    .min(2020, 'Tahun minimal 2020')
    .max(2100, 'Tahun maksimal 2100'),
});

export const GenerateDraftSchema = z.object({
  tahunAnggaran: z
    .number({ required_error: 'Tahun anggaran wajib diisi' })
    .int('Tahun anggaran harus berupa angka bulat')
    .min(2020, 'Tahun anggaran minimal 2020')
    .max(2100, 'Tahun anggaran maksimal 2100'),
  instruksiTambahan: z
    .string()
    .max(1000, 'Instruksi tambahan maksimal 1000 karakter')
    .optional(),
});

// [FITUR BARU] Schema untuk memvalidasi input dari Upload File PKPT (BYOD)
export const ParseDocumentSchema = z.object({
  // Gunakan z.coerce.number() karena data dari FormData multipart akan selalu terbaca sebagai string
  tahunAnggaran: z.coerce
    .number({ required_error: 'Tahun anggaran wajib diisi' })
    .int('Tahun anggaran harus berupa angka bulat')
    .min(2020, 'Tahun anggaran minimal 2020')
    .max(2100, 'Tahun anggaran maksimal 2100'),
});

export type CalculateRiskDto = z.infer<typeof CalculateRiskSchema>;
export type GenerateDraftDto = z.infer<typeof GenerateDraftSchema>;
export type ParseDocumentDto = z.infer<typeof ParseDocumentSchema>; // [FITUR BARU]