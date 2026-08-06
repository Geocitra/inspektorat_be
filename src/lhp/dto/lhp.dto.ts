// src/lhp/dto/lhp.dto.ts
import { z } from 'zod';

export const CreateRekomendasiInputSchema = z.object({
  uraianRekomendasi: z
    .string({ required_error: 'Uraian rekomendasi wajib diisi' })
    .min(5, 'Uraian rekomendasi terlalu pendek'),
  nilaiTuntutanFinansial: z
    .number()
    .min(0, 'Nilai tuntutan finansial tidak boleh negatif')
    .default(0),
});

export const CreateTemuanInputSchema = z.object({
  kkaId: z
    .string({ required_error: 'KKA ID wajib diisi' })
    .uuid('Format KKA ID tidak valid'),
  opdId: z
    .string({ required_error: 'OPD ID wajib diisi' })
    .uuid('Format OPD ID tidak valid'),
  kondisi: z
    .string({ required_error: 'Kondisi temuan wajib diisi' })
    .min(5, 'Kondisi temuan terlalu pendek'),
  kriteria: z
    .string({ required_error: 'Kriteria temuan wajib diisi' })
    .min(5, 'Kriteria temuan terlalu pendek'),
  sebab: z
    .string({ required_error: 'Sebab temuan wajib diisi' })
    .min(5, 'Sebab temuan terlalu pendek'),
  akibat: z
    .string({ required_error: 'Akibat temuan wajib diisi' })
    .min(5, 'Akibat temuan terlalu pendek'),
  rekomendasis: z
    .array(CreateRekomendasiInputSchema)
    .min(1, 'Setiap temuan harus memicu minimal 1 rekomendasi'),
});

export const CreateLhpSchema = z.object({
  stId: z
    .string({ required_error: 'Surat Tugas ID wajib diisi' })
    .uuid('Format Surat Tugas ID tidak valid'),
  nomorLhp: z
    .string({ required_error: 'Nomor LHP wajib diisi' })
    .min(3, 'Nomor LHP minimal 3 karakter')
    .max(150),
  ringkasanEksekutif: z
    .string({ required_error: 'Ringkasan eksekutif wajib diisi' })
    .min(10, 'Ringkasan eksekutif terlalu pendek'),
  temuan: z
    .array(CreateTemuanInputSchema)
    .default([]),
});

export const SignLhpSchema = z.object({
  digitalCertificate: z
    .string({ required_error: 'Sertifikat digital passphrase wajib diisi untuk TTE LHP' })
    .min(6, 'Digital certificate minimal 6 karakter'),
});

export type CreateLhpDto = z.infer<typeof CreateLhpSchema>;
export type SignLhpDto = z.infer<typeof SignLhpSchema>;
