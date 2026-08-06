// src/opd/dto/opd.dto.ts
// Zod schemas untuk validasi request OPD.
// Type-safe: tipe DTO diturunkan langsung dari schema (z.infer<>).

import { z } from 'zod';

// Regex untuk validasi format koordinat GPS "latitude,longitude"
const GPS_REGEX =
  /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/;

export const CreateOpdSchema = z.object({
  namaOpd: z
    .string({ required_error: 'Nama OPD wajib diisi' })
    .min(3, 'Nama OPD minimal 3 karakter')
    .max(255, 'Nama OPD maksimal 255 karakter'),
  alamat: z
    .string({ required_error: 'Alamat wajib diisi' })
    .min(5, 'Alamat minimal 5 karakter'),
  gpsKoordinat: z
    .string({ required_error: 'Koordinat GPS wajib diisi' })
    .regex(
      GPS_REGEX,
      'Format koordinat GPS tidak valid. Gunakan format: "latitude,longitude" (contoh: "-7.250445,112.768845")',
    ),
});

// Schema untuk update: semua field bersifat opsional (Partial)
export const UpdateOpdSchema = CreateOpdSchema.partial();

// TypeScript types diturunkan dari schema — tidak perlu deklarasi interface terpisah
export type CreateOpdDto = z.infer<typeof CreateOpdSchema>;
export type UpdateOpdDto = z.infer<typeof UpdateOpdSchema>;
