// src/assignment/dto/st.dto.ts
import { z } from 'zod';

export const PeranStEnum = z.enum(['Pengawas_Teknis', 'Ketua_Tim', 'Anggota_Tim']);

export const CreateStAuditorSchema = z.object({
  auditorId: z
    .string({ required_error: 'ID Auditor wajib diisi' })
    .uuid('Format ID Auditor tidak valid'),
  peranDalamTim: PeranStEnum,
});

export const CreateStSchema = z.object({
  agendaAuditId: z
    .string()
    .uuid('Format Agenda Audit ID tidak valid')
    .optional()
    .nullable(),
  nomorSt: z
    .string({ required_error: 'Nomor Surat Tugas wajib diisi' })
    .min(3, 'Nomor ST minimal 3 karakter')
    .max(150),
  tanggalMulai: z
    .string({ required_error: 'Tanggal mulai wajib diisi' })
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Format tanggal mulai tidak valid',
    }),
  tanggalSelesai: z
    .string({ required_error: 'Tanggal selesai wajib diisi' })
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Format tanggal selesai tidak valid',
    }),
  auditors: z
    .array(CreateStAuditorSchema)
    .min(3, 'Tim harus memiliki minimal 3 anggota (Pengawas Teknis, Ketua Tim, dan minimal 1 Anggota Tim)'),
}).refine((data) => Date.parse(data.tanggalSelesai) >= Date.parse(data.tanggalMulai), {
  message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
  path: ['tanggalSelesai'],
});

export const SignStSchema = z.object({
  digitalCertificate: z
    .string({ required_error: 'Digital certificate/passphrase wajib diisi untuk TTE' })
    .min(6, 'Digital certificate minimal 6 karakter'),
});

export type CreateStDto = z.infer<typeof CreateStSchema>;
export type SignStDto = z.infer<typeof SignStSchema>;
