// src/kka/schemas/pbj-audit-output.schema.ts

export const PbjAuditOutputSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'PbjAuditOutput',
    type: 'object',
    properties: {
        isMismatch: {
            type: 'boolean',
            description: 'True jika terdapat perbedaan spesifikasi fisik, merk, warna, ukuran, atau tipe antara rencana dan realisasi.',
        },
        similarityScore: {
            type: 'number',
            minimum: 0.0,
            maximum: 1.0,
            description: 'Skor kemiripan semantik fungsi barang antara Rencana vs Realisasi (0.0 s.d 1.0)',
        },
        specRequired: {
            type: 'string',
            description: 'Nama atau deskripsi spesifikasi barang yang direncanakan di dokumen RKA hasil pencocokan semantik RAG.',
        },
        priceContract: {
            type: 'number',
            minimum: 0.0,
            description: 'Harga satuan rencana anggaran (RKA) dalam Rupiah hasil ekstraksi dari teks referensi.',
        },
        volumeContract: {
            type: 'number',
            minimum: 0,
            description: 'Volume barang yang direncanakan di RKA hasil ekstraksi dari teks referensi.',
        },
        sshStandardPrice: {
            type: 'number',
            minimum: 0.0,
            description: 'Batas harga satuan tertinggi barang tersebut di pasar menurut regulasi SSH hasil pencocokan semantik RAG.',
        },
        analisisCopilot: {
            type: 'string',
            description: 'Analisis formal naratif audit membandingkan Kondisi vs Kriteria (menyebutkan merk/warna yang menyimpang, serta perbandingan harga kuitansi vs SSH daerah).',
        },
    },
    required: [
        'isMismatch',
        'similarityScore',
        'specRequired',
        'priceContract',
        'volumeContract',
        'sshStandardPrice',
        'analisisCopilot'
    ],
};