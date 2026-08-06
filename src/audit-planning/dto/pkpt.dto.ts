// src/audit-planning/dto/pkpt.dto.ts
import { z } from 'zod';

export const CreatePkptSchema = z.object({
  tahunAnggaran: z
    .number({ required_error: 'Tahun anggaran wajib diisi' })
    .int('Tahun anggaran harus berupa angka bulat')
    .min(2020, 'Tahun anggaran minimal 2020')
    .max(2100, 'Tahun anggaran maksimal 2100'),
});

export const CreateAgendaSchema = z.object({
  pkptId: z
    .string({ required_error: 'PKPT ID wajib diisi' })
    .uuid('Format PKPT ID tidak valid'),
  opdId: z
    .string({ required_error: 'OPD ID wajib diisi' })
    .uuid('Format OPD ID tidak valid'),
  jenisPengawasan: z
    .string({ required_error: 'Jenis pengawasan wajib diisi' })
    .min(3, 'Jenis pengawasan minimal 3 karakter')
    .max(100),
  perkiraanBulan: z
    .number({ required_error: 'Perkiraan bulan wajib diisi' })
    .int()
    .min(1, 'Perkiraan bulan minimal 1 (Januari)')
    .max(12, 'Perkiraan bulan maksimal 12 (Desember)'),
  estimasiAnggaran: z
    .number()
    .min(0, 'Estimasi anggaran tidak boleh negatif')
    .default(0.00),
});

export const ApprovePkptSchema = z.object({
  approvedByInspekturId: z
    .string({ required_error: 'ID Inspektur wajib diisi' })
    .uuid('Format ID Inspektur tidak valid'),
});

export type CreatePkptDto = z.infer<typeof CreatePkptSchema>;
export type CreateAgendaDto = z.infer<typeof CreateAgendaSchema>;
export type ApprovePkptDto = z.infer<typeof ApprovePkptSchema>;
