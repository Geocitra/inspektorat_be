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
    .min(1, 'Tim harus memiliki minimal 1 personil penugasan'),
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

export const RecommendTeamSchema = z.object({
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
  fokusAudit: z
    .string({ required_error: 'Fokus audit wajib diisi untuk pencocokan kompetensi' })
    .min(3, 'Fokus audit minimal 3 karakter')
    .max(500),
  agendaAuditId: z
    .string()
    .uuid('Format Agenda Audit ID tidak valid')
    .optional()
    .nullable(),
  pelaksana: z
    .string()
    .max(100)
    .optional()
    .nullable(),
}).refine((data) => Date.parse(data.tanggalSelesai) >= Date.parse(data.tanggalMulai), {
  message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
  path: ['tanggalSelesai'],
});

export const GeneratePkaSchema = z.object({
  fokusPengawasan: z
    .string()
    .max(1000, 'Fokus pengawasan maksimal 1000 karakter')
    .optional(),
});

export type RecommendTeamDto = z.infer<typeof RecommendTeamSchema>;
export type GeneratePkaDto = z.infer<typeof GeneratePkaSchema>;

