import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Mengosongkan tabel transaksi (user, opd, pegawai dipertahankan)...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "tr_pka", "tr_kka", "tr_lhp", "tr_temuan", "tr_rekomendasi",
      "tr_tindak_lanjut", "tr_bukti_tindak_lanjut", "tr_verifikasi_tindak_lanjut",
      "sec_append_only_log", "wbs_aduan", "wbs_bukti", "wbs_chat",
      "tr_rekomendasi_penugasan_khusus", "mst_kategori_regulasi", "mst_regulasi",
      "tr_tiket_konsultasi", "tr_lampiran_konsultasi", "rel_tiket_regulasi",
      "tr_kms_artikel", "audit_documents", "doc_metadata", "doc_chunks",
      "tr_item_audit_pbj", "opd_risk_assessments",
      "rel_st_auditor", "tr_surat_tugas", "tr_agenda_audit", "tr_pkpt"
    CASCADE;
  `);
  const users = await prisma.user.count();
  const opd = await prisma.mstOpd.count();
  const peg = await prisma.mstPegawai.count();
  console.log('[OK] Selesai. Data yang dipertahankan:');
  console.log('  Users:', users, '| OPD:', opd, '| Pegawai:', peg);
}

main().catch(console.error).finally(() => prisma.$disconnect());
