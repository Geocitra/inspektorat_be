// src/klinik/dto/klinik.dto.ts
import { z } from 'zod';

export const CreateKategoriRegulasiSchema = z.object({
  namaKategori: z
    .string({ required_error: 'Nama kategori wajib diisi' })
    .min(3, 'Nama kategori terlalu pendek'),
});

export const CreateRegulasiSchema = z.object({
  kategoriId: z
    .string({ required_error: 'Kategori ID wajib diisi' })
    .uuid('Format Kategori ID tidak valid'),
  nomorRegulasi: z
    .string({ required_error: 'Nomor regulasi wajib diisi' })
    .min(2, 'Nomor regulasi terlalu pendek'),
  tentang: z
    .string({ required_error: 'Tentang regulasi wajib diisi' })
    .min(5, 'Tentang regulasi terlalu pendek'),
  kontenTeks: z
    .string({ required_error: 'Konten regulasi wajib diisi' })
    .min(10, 'Konten regulasi terlalu pendek'),
  tahunTerbit: z
    .number({ required_error: 'Tahun terbit wajib diisi' })
    .int('Tahun terbit harus berupa angka bulat')
    .min(1945, 'Tahun terbit tidak valid'),
});

export const CreateTiketKonsultasiSchema = z.object({
  opdId: z
    .string({ required_error: 'OPD ID wajib diisi' })
    .uuid('Format OPD ID tidak valid'),
  judulPertanyaan: z
    .string({ required_error: 'Judul pertanyaan wajib diisi' })
    .min(5, 'Judul terlalu pendek'),
  deskripsiKasus: z
    .string({ required_error: 'Deskripsi kasus wajib diisi' })
    .min(10, 'Deskripsi terlalu pendek'),
  irbanId: z
    .string({ required_error: 'ID Irban wajib diisi' })
    .uuid('Format ID Irban tidak valid'),
});

export const SubmitJawabanSchema = z.object({
  jawabanResmi: z
    .string({ required_error: 'Jawaban resmi wajib diisi' })
    .min(5, 'Jawaban resmi terlalu pendek'),
  auditorJawabId: z
    .string({ required_error: 'ID Auditor penjawab wajib diisi' })
    .uuid('Format ID Auditor tidak valid'),
});

export const ArchiveKmsSchema = z.object({
  kategori: z
    .string({ required_error: 'Kategori KMS wajib diisi' })
    .min(3, 'Kategori terlalu pendek'),
  judulStudiKasus: z
    .string({ required_error: 'Judul studi kasus wajib diisi' })
    .min(5, 'Judul terlalu pendek'),
  referensiRegulasiId: z.string().uuid('Format ID Regulasi tidak valid').optional(),
});

export type CreateKategoriRegulasiDto = z.infer<typeof CreateKategoriRegulasiSchema>;
export type CreateRegulasiDto = z.infer<typeof CreateRegulasiSchema>;
export type CreateTiketKonsultasiDto = z.infer<typeof CreateTiketKonsultasiSchema>;
export type SubmitJawabanDto = z.infer<typeof SubmitJawabanSchema>;
export type ArchiveKmsDto = z.infer<typeof ArchiveKmsSchema>;
