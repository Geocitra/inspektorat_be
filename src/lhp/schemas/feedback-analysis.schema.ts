export const FeedbackAnalysisSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'FeedbackAnalysis',
    type: 'object',
    properties: {
        isJustificationValid: {
            type: 'boolean',
            description: 'True jika pembelaan atau alasan OPD didukung secara sah oleh rujukan regulasi pengadaan daerah.',
        },
        rekomendasiStatus: {
            type: 'string',
            enum: ['TUNTAS', 'TETAP_TEMUAN'],
            description: 'Keputusan status rekomendasi akhir untuk barang tersebut.',
        },
        confidenceScore: {
            type: 'number',
            minimum: 0.0,
            maximum: 1.0,
            description: 'Seberapa yakin AI terhadap evaluasi dokumen justifikasi ini.',
        },
        analisisKepatuhan: {
            type: 'string',
            description: 'Analisis naratif kepatuhan regulasi mengapa pembelaan OPD ini sah atau melanggar hukum.',
        },
    },
    required: ['isJustificationValid', 'rekomendasiStatus', 'confidenceScore', 'analisisKepatuhan'],
};