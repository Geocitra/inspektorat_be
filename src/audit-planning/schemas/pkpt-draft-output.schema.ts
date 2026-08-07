// src/audit-planning/schemas/pkpt-draft-output.schema.ts
export const PkptDraftOutputSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PkptDraftOutput',
  type: 'object',
  properties: {
    agendaItems: {
      type: 'array',
      description: 'Daftar usulan agenda audit untuk OPD-OPD yang di-ranking',
      items: {
        type: 'object',
        properties: {
          opdId: {
            type: 'string',
            description: 'UUID OPD target yang didapat dari data ranking input',
          },
          opdName: {
            type: 'string',
            description: 'Nama OPD target',
          },
          jenisPengawasan: {
            type: 'string',
            enum: ['Audit', 'Reviu', 'Evaluasi', 'Pemantauan'],
            description: 'Tipe pengawasan yang direkomendasikan',
          },
          perkiraanBulan: {
            type: 'integer',
            minimum: 1,
            maximum: 12,
            description: 'Perkiraan bulan pelaksanaan (1 s.d 12)',
          },
          estimasiAnggaran: {
            type: 'number',
            minimum: 0,
            description: 'Alokasi anggaran kas dalam rupiah',
          },
          hariPemeriksaan: {
            type: 'object',
            properties: {
              pj: { type: 'integer', minimum: 0, description: 'Hari Pemeriksaan Penanggung Jawab' },
              wkpj: { type: 'integer', minimum: 0, description: 'Hari Pemeriksaan Wakil Penanggung Jawab' },
              dalnis: { type: 'integer', minimum: 0, description: 'Hari Pemeriksaan Pengendali Teknis' },
              kt: { type: 'integer', minimum: 0, description: 'Hari Pemeriksaan Ketua Tim' },
              at: { type: 'integer', minimum: 0, description: 'Hari Pemeriksaan Anggota Tim' },
            },
            required: ['pj', 'wkpj', 'dalnis', 'kt', 'at'],
          },
          saranaPrasarana: {
            type: 'array',
            items: { type: 'string' },
            description: 'Daftar kebutuhan logistik (contoh: Laptop, Printer, Kertas, Mobil Dinas)',
          },
          alasanPrioritas: {
            type: 'string',
            description: 'Justifikasi naratif mengapa OPD ini diprioritaskan untuk jenis pengawasan tersebut berdasarkan tingkat risikonya',
          },
        },
        required: [
          'opdId',
          'opdName',
          'jenisPengawasan',
          'perkiraanBulan',
          'estimasiAnggaran',
          'hariPemeriksaan',
          'saranaPrasarana',
          'alasanPrioritas',
        ],
      },
    },
  },
  required: ['agendaItems'],
};
