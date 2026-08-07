// src/kka/dto/pbj-audit.dto.ts
import { z } from 'zod';

export const AuditPbjSchema = z.object({
    spjSheetName: z
        .string()
        .min(1, 'Nama sheet SPJ tidak boleh kosong')
        .default('SPJ')
        .describe('Nama lembar kerja Excel yang berisi realisasi kuitansi/SPJ'),

    rkaSheetName: z
        .string()
        .min(1, 'Nama sheet RKA tidak boleh kosong')
        .default('RKA')
        .describe('Nama lembar kerja Excel yang berisi rencana kerja anggaran (RKA)'),

    // Preprocess coercion untuk mengonversi string angka dari form-data menjadi integer JS
    rowStart: z
        .preprocess((val) => {
            if (typeof val === 'string') {
                const parsed = parseInt(val, 10);
                return isNaN(parsed) ? val : parsed;
            }
            return val;
        }, z.number({ required_error: 'Baris awal pembacaan wajib diisi' })
            .int('Baris awal harus berupa angka bulat')
            .min(1, 'Baris awal pembacaan minimal baris ke-1')
        )
        .default(2)
        .describe('Baris awal dimulainya pembacaan data (melewati header)'),
});

export type AuditPbjDto = z.infer<typeof AuditPbjSchema>;