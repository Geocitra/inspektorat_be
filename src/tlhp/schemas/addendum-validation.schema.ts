// src/tlhp/schemas/addendum-validation.schema.ts

export const AddendumValidationSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'AddendumValidation',
    type: 'object',
    properties: {
        isJustificationValid: {
            type: 'boolean',
            description: 'True jika argumen pembelaan / adendum kontrak yang diunggah OPD dibenarkan secara hukum daerah atau nasional (misal: adendum akibat kelangkaan barang di pasar).',
        },
        rekomendasiStatus: {
            type: 'string',
            enum: ['TUNTAS', 'TETAP_TEMUAN'],
            description: 'Keputusan rekomendasi status tindak lanjut: TUNTAS (justifikasi sah) atau TETAP_TEMUAN (justifikasi tidak layak/tidak sah secara hukum).',
        },
        confidenceScore: {
            type: 'number',
            minimum: 0.0,
            maximum: 1.0,
            description: 'Seberapa yakin AI terhadap evaluasi dokumen adendum ini (0.0 s.d 1.0).',
        },
        pasalHukumAsosiasi: {
            type: 'string',
            description: 'Pasal atau dasar peraturan hukum resmi (contoh: "Perpres 12/2021 Pasal 54") yang mendasari keputusan kelayakan adendum kontrak tersebut.',
        },
        analisisKepatuhan: {
            type: 'string',
            description: 'Analisis naratif formal membandingkan argumen adendum kontrak OPD dengan kriteria aturan hukum yang terindeks.',
        },
    },
    required: [
        'isJustificationValid',
        'rekomendasiStatus',
        'confidenceScore',
        'pasalHukumAsosiasi',
        'analisisKepatuhan',
    ],
};