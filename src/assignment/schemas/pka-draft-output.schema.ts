// src/assignment/schemas/pka-draft-output.schema.ts
export const PkaDraftOutputSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PkaDraftOutput',
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      description: 'Langkah-langkah kerja program pengawasan audit',
      items: {
        type: 'object',
        properties: {
          noLangkah: {
            type: 'string',
            description: 'Nomor indeks langkah kerja (contoh: "A.1", "B.2")',
          },
          prosedur: {
            type: 'string',
            description: 'Uraian rincian langkah kerja pengujian substantif atau kepatuhan',
          },
          pelaksanaRencana: {
            type: 'string',
            enum: ['Pengawas_Teknis', 'Ketua_Tim', 'Anggota_Tim'],
            description: 'Peran auditor yang direncanakan melaksanakan langkah ini',
          },
          waktuRencana: {
            type: 'integer',
            minimum: 1,
            description: 'Estimasi alokasi jam kerja pengawasan (HP)',
          },
        },
        required: ['noLangkah', 'prosedur', 'pelaksanaRencana', 'waktuRencana'],
      },
    },
  },
  required: ['steps'],
};
