// src/audit-planning/schemas/pkpt-draft-output.schema.ts
export const PkptDraftOutputSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PkptDraftOutput',
  type: 'object',
  properties: {
    agendaItems: {
      type: 'array',
      description: 'Daftar usulan agenda audit PKPT berbasis risiko sesuai 14 kolom standar pengawasan',
      items: {
        type: 'object',
        properties: {
          opdId: {
            type: 'string',
            description: 'UUID OPD target dari database resmi',
          },
          opdName: {
            type: 'string',
            description: 'Nama Perangkat Daerah / OPD',
          },
          areaPengawasan: {
            type: 'string',
            description: 'Area Pengawasan / Nama Program Kerja yang diawasi (contoh: Program Pencegahan Kebakaran, Program Pengelolaan Pendidikan)',
          },
          jenisPengawasan: {
            type: 'string',
            description: 'Jenis Pengawasan (contoh: Audit Tujuan Tertentu, Audit Ketaatan PBJ, Probity Audit, Reviu, Evaluasi, Pemantauan)',
          },
          tujuanSasaran: {
            type: 'string',
            description: 'Tujuan dan Sasaran pemeriksaan (poin-poin target assurance/advisory)',
          },
          ruangLingkup: {
            type: 'string',
            description: 'Ruang lingkup audit (contoh: Belanja Barang & Modal T.A. 2024, Perencanaan s.d Pelaksanaan PBJ)',
          },
          pelaksana: {
            type: 'string',
            description: 'Unit Pelaksana Inspektorat (contoh: Irban 1, Irban 2, Irban 3, Irban Investigasi)',
          },
          jadwal: {
            type: 'string',
            description: 'Jadwal pelaksanaan (contoh: TW I, TW II, TW III, TW IV)',
          },
          perkiraanBulan: {
            type: 'integer',
            minimum: 1,
            maximum: 12,
            description: 'Perkiraan bulan mulai pelaksanaan (1 s.d 12)',
          },
          estimasiAnggaran: {
            type: 'number',
            minimum: 0,
            description: 'Estimasi anggaran pengawasan jika ada (default: 0 jika tidak dicantumkan)',
          },
          hariPemeriksaan: {
            type: 'object',
            properties: {
              pj: { type: 'integer', minimum: 0, description: 'HP Penanggung Jawab' },
              wkpj: { type: 'integer', minimum: 0, description: 'HP Wakil Penanggung Jawab' },
              dalnis: { type: 'integer', minimum: 0, description: 'HP Pengendali Teknis' },
              kt: { type: 'integer', minimum: 0, description: 'HP Ketua Tim' },
              at: { type: 'integer', minimum: 0, description: 'HP Anggota Tim' },
              totalHp: { type: 'integer', minimum: 0, description: 'Total Hari Pemeriksaan (JUM HP)' },
            },
            required: ['pj', 'dalnis', 'kt', 'at', 'totalHp'],
          },
          jumlahLaporan: {
            type: 'integer',
            minimum: 1,
            description: 'Jumlah Laporan Hasil Pengawasan (JUM LAP)',
          },
          saranaPrasarana: {
            type: 'array',
            items: { type: 'string' },
            description: 'Kebutuhan sarana dan prasarana logistik (contoh: Laptop, Printer, ATK, Kendaraan Roda 4, Alat Ukur)',
          },
          tingkatRisiko: {
            type: 'string',
            enum: ['Tinggi', 'Sedang', 'Rendah'],
            description: 'Tingkat Risiko audit',
          },
          keterangan: {
            type: 'string',
            description: 'Keterangan tambahan',
          },
          alasanPrioritas: {
            type: 'string',
            description: 'Justifikasi pemilihan agenda pengawasan',
          },
        },
        required: [
          'opdId',
          'opdName',
          'areaPengawasan',
          'jenisPengawasan',
          'tujuanSasaran',
          'ruangLingkup',
          'pelaksana',
          'jadwal',
          'hariPemeriksaan',
          'tingkatRisiko',
        ],
      },
    },
  },
  required: ['agendaItems'],
};
