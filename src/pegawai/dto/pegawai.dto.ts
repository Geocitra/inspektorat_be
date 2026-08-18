// src/pegawai/dto/pegawai.dto.ts
// Zod schemas untuk validasi request Pegawai.
// Terdapat 3 schema:
//   1. CreatePegawaiSchema  - untuk input manual admin
//   2. UpdatePegawaiSchema  - untuk update parsial
//   3. SyncPegawaiSchema    - untuk push data dari server BKD (Badan Kepegawaian Daerah)

import { z } from 'zod';

export const UnitKerjaEnum = z.enum([
  'IRBAN_1',
  'IRBAN_2',
  'IRBAN_3',
  'IRBAN_INVESTIGASI',
  'SEKRETARIAT',
]);

export const CreatePegawaiSchema = z.object({
  nip: z
    .string({ required_error: 'NIP wajib diisi' })
    .min(5, 'NIP minimal 5 karakter')
    .max(50, 'NIP maksimal 50 karakter'),
  nama: z
    .string({ required_error: 'Nama pegawai wajib diisi' })
    .min(3, 'Nama minimal 3 karakter')
    .max(255, 'Nama maksimal 255 karakter'),
  golongan: z.string().max(100, 'Golongan maksimal 100 karakter').optional(),
  jabatan: z.string().max(100, 'Jabatan maksimal 100 karakter').optional(),
  unitKerja: UnitKerjaEnum.default('IRBAN_1').optional(),
  isAuditorLapangan: z.boolean().default(true).optional(),
  opdId: z
    .string({ required_error: 'OPD ID wajib diisi' })
    .uuid('Format OPD ID tidak valid (harus UUID)'),
});

// Schema update: semua field bersifat opsional
export const UpdatePegawaiSchema = CreatePegawaiSchema.partial();

// Schema khusus untuk endpoint sinkronisasi data dari server BKD.
// Perbedaan utama: menggunakan namaOpdAsal (string nama) bukan opdId (UUID),
// karena sistem BKD tidak mengenal UUID internal kita.
export const SyncPegawaiSchema = z.object({
  nip: z.string().min(10).max(50).regex(/^\d+$/, 'NIP hanya boleh berisi angka'),
  nama: z.string().min(3).max(255),
  golongan: z.string().max(100).optional(),
  jabatan: z.string().max(100).optional(),
  namaOpdAsal: z
    .string({ required_error: 'Nama OPD asal wajib diisi' })
    .min(3, 'Nama OPD minimal 3 karakter')
    .max(255)
    .describe(
      'Nama OPD seperti yang terdaftar di BKD. Sistem akan mencocokkan ke tabel mst_opd secara otomatis.',
    ),
});

// TypeScript types diturunkan dari schema
export type CreatePegawaiDto = z.infer<typeof CreatePegawaiSchema>;
export type UpdatePegawaiDto = z.infer<typeof UpdatePegawaiSchema>;
export type SyncPegawaiDto = z.infer<typeof SyncPegawaiSchema>;
