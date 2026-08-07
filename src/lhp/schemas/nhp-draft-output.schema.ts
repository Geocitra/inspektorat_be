export const NhpDraftOutputSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'NhpDraftOutput',
    type: 'object',
    properties: {
        temuanUtama: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    judulTemuan: { type: 'string' },
                    kondisi: { type: 'string' },
                    kriteria: { type: 'string' },
                    sebab: { type: 'string' },
                    akibat: { type: 'string' },
                    rekomendasi: { type: 'string' },
                },
                required: ['judulTemuan', 'kondisi', 'kriteria', 'sebab', 'akibat', 'rekomendasi'],
            },
        },
    },
    required: ['temuanUtama'],
};