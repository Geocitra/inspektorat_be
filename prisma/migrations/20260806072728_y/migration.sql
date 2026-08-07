-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('APIP_INTERNAL', 'APIP_PIMPINAN', 'AUDITEE_OPD', 'KEPALA_DAERAH');

-- CreateEnum
CREATE TYPE "SumberData" AS ENUM ('MANUAL', 'SINKRONISASI_BKD');

-- CreateEnum
CREATE TYPE "StatusPkpt" AS ENUM ('DRAF', 'MENUNGGU_PERSETUJUAN', 'DISETUJUI');

-- CreateEnum
CREATE TYPE "StatusSt" AS ENUM ('DRAF', 'AKTIF', 'SELESAI');

-- CreateEnum
CREATE TYPE "PeranSt" AS ENUM ('Pengawas_Teknis', 'Ketua_Tim', 'Anggota_Tim');

-- CreateEnum
CREATE TYPE "StatusKka" AS ENUM ('DRAF', 'MENUNGGU_ULASAN', 'APPROVED', 'REVISI');

-- CreateEnum
CREATE TYPE "StatusTemuan" AS ENUM ('PROSES', 'SIAP_DIKUNCI', 'TUNTAS');

-- CreateEnum
CREATE TYPE "StatusRekomendasi" AS ENUM ('BELUM_TINDAK_LANJUT', 'MENUNGGU_VERIFIKASI', 'BELUM_SESUAI', 'SESUAI');

-- CreateEnum
CREATE TYPE "StatusTindakLanjut" AS ENUM ('MENUNGGU_VERIFIKASI', 'BELUM_SESUAI', 'SESUAI');

-- CreateEnum
CREATE TYPE "HasilVerifikasi" AS ENUM ('SESUAI', 'BELUM_SESUAI');

-- CreateEnum
CREATE TYPE "StatusWbs" AS ENUM ('Diterima', 'Butuh_Klarifikasi', 'Penyelidikan', 'Arsip');

-- CreateEnum
CREATE TYPE "KeputusanTriage" AS ENUM ('Klarifikasi_Dibutuhkan', 'Diarsipkan_Tolak', 'Rekomendasi_Audit');

-- CreateEnum
CREATE TYPE "HasilTriage" AS ENUM ('Menunggu_Otorisasi_Pimpinan', 'DISETUJUI', 'DITOLAK');

-- CreateEnum
CREATE TYPE "StatusTiket" AS ENUM ('MENUNGGU_JAWABAN', 'TERJAWAB', 'ESKALASI');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('REGULASI_INTERNAL', 'REGULASI_DAERAH', 'TEMPLATES', 'LAINNYA');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAF', 'AKTIF', 'ARSIP');

-- CreateEnum
CREATE TYPE "SumberPembuatan" AS ENUM ('SYSTEM', 'AI_COPILOT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "SystemRole" NOT NULL,
    "pegawai_id" UUID,
    "opd_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mst_opd" (
    "id" UUID NOT NULL,
    "nama_opd" VARCHAR(255) NOT NULL,
    "alamat" TEXT NOT NULL,
    "gps_koordinat" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mst_opd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mst_pegawai" (
    "id" UUID NOT NULL,
    "nip" VARCHAR(50) NOT NULL,
    "nama" VARCHAR(255) NOT NULL,
    "golongan" VARCHAR(100),
    "jabatan" VARCHAR(100),
    "opd_id" UUID NOT NULL,
    "sumber_data" "SumberData" NOT NULL DEFAULT 'MANUAL',
    "terakhir_disinkronkan" TIMESTAMPTZ,

    CONSTRAINT "mst_pegawai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_pkpt" (
    "id" UUID NOT NULL,
    "tahun_anggaran" INTEGER NOT NULL,
    "status_pkpt" "StatusPkpt" NOT NULL DEFAULT 'DRAF',
    "approved_by_inspektur_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "sumber_pembuatan" "SumberPembuatan" NOT NULL DEFAULT 'SYSTEM',
    "substansi_dokumen" JSONB,

    CONSTRAINT "tr_pkpt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_agenda_audit" (
    "id" UUID NOT NULL,
    "pkpt_id" UUID NOT NULL,
    "opd_id" UUID NOT NULL,
    "jenis_pengawasan" VARCHAR(100) NOT NULL,
    "perkiraan_bulan" INTEGER NOT NULL,
    "estimasi_anggaran" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sumber_pembuatan" "SumberPembuatan" NOT NULL DEFAULT 'SYSTEM',
    "substansi_dokumen" JSONB,

    CONSTRAINT "tr_agenda_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_surat_tugas" (
    "id" UUID NOT NULL,
    "agenda_audit_id" UUID,
    "nomor_st" VARCHAR(150) NOT NULL,
    "tanggal_mulai" DATE NOT NULL,
    "tanggal_selesai" DATE NOT NULL,
    "status_st" "StatusSt" NOT NULL DEFAULT 'DRAF',
    "signed_at" TIMESTAMPTZ,
    "rekomendasi_penugasan_khusus_id" UUID,

    CONSTRAINT "tr_surat_tugas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rel_st_auditor" (
    "id" UUID NOT NULL,
    "st_id" UUID NOT NULL,
    "auditor_id" UUID NOT NULL,
    "peran_dalam_tim" "PeranSt" NOT NULL,

    CONSTRAINT "rel_st_auditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_kka" (
    "id" UUID NOT NULL,
    "st_id" UUID NOT NULL,
    "pka_id" UUID,
    "prosedur_pemeriksaan" TEXT NOT NULL,
    "uraian_pengujian" TEXT NOT NULL,
    "kesimpulan_sementara" TEXT NOT NULL,
    "status_kka" "StatusKka" NOT NULL DEFAULT 'DRAF',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lhp_id" UUID,

    CONSTRAINT "tr_kka_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_lhp" (
    "id" UUID NOT NULL,
    "st_id" UUID NOT NULL,
    "nomor_lhp" VARCHAR(150) NOT NULL,
    "ringkasan_eksekutif" TEXT NOT NULL,
    "file_lhp_signed_path" VARCHAR(255) NOT NULL,
    "signed_at" TIMESTAMPTZ,

    CONSTRAINT "tr_lhp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_temuan" (
    "id" UUID NOT NULL,
    "lhp_id" UUID NOT NULL,
    "kka_id" UUID NOT NULL,
    "opd_id" UUID NOT NULL,
    "kondisi" TEXT NOT NULL,
    "kriteria" TEXT NOT NULL,
    "sebab" TEXT NOT NULL,
    "akibat" TEXT NOT NULL,
    "status_temuan" "StatusTemuan" NOT NULL DEFAULT 'PROSES',

    CONSTRAINT "tr_temuan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_rekomendasi" (
    "id" UUID NOT NULL,
    "temuan_id" UUID NOT NULL,
    "uraian_rekomendasi" TEXT NOT NULL,
    "nilai_tuntutan_finansial" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "status_rekomendasi" "StatusRekomendasi" NOT NULL DEFAULT 'BELUM_TINDAK_LANJUT',

    CONSTRAINT "tr_rekomendasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_tindak_lanjut" (
    "id" UUID NOT NULL,
    "rekomendasi_id" UUID NOT NULL,
    "uraian_tindakan" TEXT NOT NULL,
    "is_terlambat" BOOLEAN NOT NULL DEFAULT false,
    "status_tindak_lanjut" "StatusTindakLanjut" NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
    "tanggal_unggah" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tr_tindak_lanjut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_bukti_tindak_lanjut" (
    "id" UUID NOT NULL,
    "tindak_lanjut_id" UUID NOT NULL,
    "file_path" VARCHAR(255) NOT NULL,
    "gps_latitude" DOUBLE PRECISION,
    "gps_longitude" DOUBLE PRECISION,
    "timestamp_metadata" TIMESTAMPTZ,

    CONSTRAINT "tr_bukti_tindak_lanjut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_verifikasi_tindak_lanjut" (
    "id" UUID NOT NULL,
    "tindak_lanjut_id" UUID NOT NULL,
    "verifikator_id" UUID NOT NULL,
    "catatan_verifikator" TEXT NOT NULL,
    "hasil_verifikasi" "HasilVerifikasi" NOT NULL,
    "tanggal_verifikasi" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tr_verifikasi_tindak_lanjut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_append_only_log" (
    "id" UUID NOT NULL,
    "event_name" VARCHAR(255) NOT NULL,
    "actor_id" UUID NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "data_payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_append_only_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_aduan" (
    "id" UUID NOT NULL,
    "token_pelacakan" VARCHAR(100) NOT NULL,
    "kategori" VARCHAR(150) NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "status" "StatusWbs" NOT NULL DEFAULT 'Diterima',
    "catatan_akhir" TEXT,
    "tanggal_kirim" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wbs_aduan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_bukti" (
    "id" UUID NOT NULL,
    "wbs_aduan_id" UUID NOT NULL,
    "file_path" VARCHAR(255) NOT NULL,

    CONSTRAINT "wbs_bukti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_chat" (
    "id" UUID NOT NULL,
    "wbs_aduan_id" UUID NOT NULL,
    "sender" VARCHAR(50) NOT NULL,
    "pesan" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wbs_chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_rekomendasi_penugasan_khusus" (
    "id" UUID NOT NULL,
    "wbs_aduan_id" UUID NOT NULL,
    "judul" VARCHAR(255) NOT NULL,
    "rekomendator_id" UUID NOT NULL,
    "status" "HasilTriage" NOT NULL DEFAULT 'Menunggu_Otorisasi_Pimpinan',
    "tanggal_rekomendasi" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tr_rekomendasi_penugasan_khusus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mst_kategori_regulasi" (
    "id" UUID NOT NULL,
    "nama_kategori" VARCHAR(150) NOT NULL,

    CONSTRAINT "mst_kategori_regulasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mst_regulasi" (
    "id" UUID NOT NULL,
    "kategori_id" UUID NOT NULL,
    "nomor_regulasi" VARCHAR(150) NOT NULL,
    "tentang" VARCHAR(255) NOT NULL,
    "konten_teks" TEXT NOT NULL,
    "tahun_terbit" INTEGER NOT NULL,
    "embedding" DOUBLE PRECISION[],

    CONSTRAINT "mst_regulasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_tiket_konsultasi" (
    "id" UUID NOT NULL,
    "opd_id" UUID NOT NULL,
    "nomor_tiket" VARCHAR(100) NOT NULL,
    "judul_pertanyaan" VARCHAR(255) NOT NULL,
    "deskripsi_kasus" TEXT NOT NULL,
    "irban_id" UUID NOT NULL,
    "status" "StatusTiket" NOT NULL DEFAULT 'MENUNGGU_JAWABAN',
    "rancangan_jawaban" TEXT,
    "jawaban_resmi" TEXT,
    "auditor_jawab_id" UUID,
    "tanggal_pengajuan" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tr_tiket_konsultasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_lampiran_konsultasi" (
    "id" UUID NOT NULL,
    "tiket_id" UUID NOT NULL,
    "file_path" VARCHAR(255) NOT NULL,

    CONSTRAINT "tr_lampiran_konsultasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rel_tiket_regulasi" (
    "id" UUID NOT NULL,
    "tiket_id" UUID NOT NULL,
    "regulasi_id" UUID NOT NULL,

    CONSTRAINT "rel_tiket_regulasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_kms_artikel" (
    "id" UUID NOT NULL,
    "tiket_id" UUID NOT NULL,
    "kategori" VARCHAR(150) NOT NULL,
    "judul_studi_kasus" VARCHAR(255) NOT NULL,
    "deskripsi_kasus_anonim" TEXT NOT NULL,
    "solusi_hukum" TEXT NOT NULL,
    "referensi_regulasi_id" UUID,
    "tanggal_arsip" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tr_kms_artikel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_documents" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAF',
    "file_path" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "audit_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_metadata" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "total_chunks" INTEGER NOT NULL,
    "total_tokens" INTEGER,
    "hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_item_audit_pbj" (
    "id" UUID NOT NULL,
    "kka_id" UUID NOT NULL,
    "item_name" VARCHAR(255) NOT NULL,
    "spec_required" TEXT,
    "spec_actual" TEXT,
    "price_contract" DECIMAL(15,2),
    "price_actual" DECIMAL(15,2),
    "volume_contract" DECIMAL(15,2),
    "volume_actual" DECIMAL(15,2),
    "selisih_harga" DECIMAL(15,2),
    "status" VARCHAR(50) NOT NULL,
    "sumber_pembuatan" VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tr_item_audit_pbj_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opd_risk_assessments" (
    "id" UUID NOT NULL,
    "opd_id" UUID NOT NULL,
    "tahun" INTEGER NOT NULL,
    "nri" DECIMAL(5,2) NOT NULL,
    "nfr" DECIMAL(5,2) NOT NULL,
    "ntr" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opd_risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tr_pka" (
    "id" UUID NOT NULL,
    "st_id" UUID NOT NULL,
    "no_langkah" VARCHAR(50) NOT NULL,
    "prosedur" TEXT NOT NULL,
    "pelaksana_rencana" VARCHAR(100),
    "waktu_rencana" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tr_pka_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_pegawai_id_key" ON "users"("pegawai_id");

-- CreateIndex
CREATE UNIQUE INDEX "mst_opd_nama_opd_key" ON "mst_opd"("nama_opd");

-- CreateIndex
CREATE UNIQUE INDEX "mst_pegawai_nip_key" ON "mst_pegawai"("nip");

-- CreateIndex
CREATE UNIQUE INDEX "tr_pkpt_tahun_anggaran_key" ON "tr_pkpt"("tahun_anggaran");

-- CreateIndex
CREATE UNIQUE INDEX "tr_surat_tugas_agenda_audit_id_key" ON "tr_surat_tugas"("agenda_audit_id");

-- CreateIndex
CREATE UNIQUE INDEX "tr_surat_tugas_nomor_st_key" ON "tr_surat_tugas"("nomor_st");

-- CreateIndex
CREATE UNIQUE INDEX "tr_surat_tugas_rekomendasi_penugasan_khusus_id_key" ON "tr_surat_tugas"("rekomendasi_penugasan_khusus_id");

-- CreateIndex
CREATE UNIQUE INDEX "rel_st_auditor_st_id_auditor_id_key" ON "rel_st_auditor"("st_id", "auditor_id");

-- CreateIndex
CREATE UNIQUE INDEX "tr_lhp_st_id_key" ON "tr_lhp"("st_id");

-- CreateIndex
CREATE UNIQUE INDEX "tr_lhp_nomor_lhp_key" ON "tr_lhp"("nomor_lhp");

-- CreateIndex
CREATE UNIQUE INDEX "tr_verifikasi_tindak_lanjut_tindak_lanjut_id_key" ON "tr_verifikasi_tindak_lanjut"("tindak_lanjut_id");

-- CreateIndex
CREATE UNIQUE INDEX "wbs_aduan_token_pelacakan_key" ON "wbs_aduan"("token_pelacakan");

-- CreateIndex
CREATE UNIQUE INDEX "tr_rekomendasi_penugasan_khusus_wbs_aduan_id_key" ON "tr_rekomendasi_penugasan_khusus"("wbs_aduan_id");

-- CreateIndex
CREATE UNIQUE INDEX "mst_kategori_regulasi_nama_kategori_key" ON "mst_kategori_regulasi"("nama_kategori");

-- CreateIndex
CREATE UNIQUE INDEX "mst_regulasi_nomor_regulasi_key" ON "mst_regulasi"("nomor_regulasi");

-- CreateIndex
CREATE UNIQUE INDEX "tr_tiket_konsultasi_nomor_tiket_key" ON "tr_tiket_konsultasi"("nomor_tiket");

-- CreateIndex
CREATE UNIQUE INDEX "rel_tiket_regulasi_tiket_id_regulasi_id_key" ON "rel_tiket_regulasi"("tiket_id", "regulasi_id");

-- CreateIndex
CREATE UNIQUE INDEX "tr_kms_artikel_tiket_id_key" ON "tr_kms_artikel"("tiket_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_metadata_document_id_key" ON "doc_metadata"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "opd_risk_assessments_opd_id_tahun_key" ON "opd_risk_assessments"("opd_id", "tahun");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_opd_id_fkey" FOREIGN KEY ("opd_id") REFERENCES "mst_opd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "mst_pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mst_pegawai" ADD CONSTRAINT "mst_pegawai_opd_id_fkey" FOREIGN KEY ("opd_id") REFERENCES "mst_opd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_pkpt" ADD CONSTRAINT "tr_pkpt_approved_by_inspektur_id_fkey" FOREIGN KEY ("approved_by_inspektur_id") REFERENCES "mst_pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_agenda_audit" ADD CONSTRAINT "tr_agenda_audit_pkpt_id_fkey" FOREIGN KEY ("pkpt_id") REFERENCES "tr_pkpt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_agenda_audit" ADD CONSTRAINT "tr_agenda_audit_opd_id_fkey" FOREIGN KEY ("opd_id") REFERENCES "mst_opd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_surat_tugas" ADD CONSTRAINT "tr_surat_tugas_agenda_audit_id_fkey" FOREIGN KEY ("agenda_audit_id") REFERENCES "tr_agenda_audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_surat_tugas" ADD CONSTRAINT "tr_surat_tugas_rekomendasi_penugasan_khusus_id_fkey" FOREIGN KEY ("rekomendasi_penugasan_khusus_id") REFERENCES "tr_rekomendasi_penugasan_khusus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rel_st_auditor" ADD CONSTRAINT "rel_st_auditor_st_id_fkey" FOREIGN KEY ("st_id") REFERENCES "tr_surat_tugas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rel_st_auditor" ADD CONSTRAINT "rel_st_auditor_auditor_id_fkey" FOREIGN KEY ("auditor_id") REFERENCES "mst_pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_kka" ADD CONSTRAINT "tr_kka_st_id_fkey" FOREIGN KEY ("st_id") REFERENCES "tr_surat_tugas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_kka" ADD CONSTRAINT "tr_kka_pka_id_fkey" FOREIGN KEY ("pka_id") REFERENCES "tr_pka"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_kka" ADD CONSTRAINT "tr_kka_lhp_id_fkey" FOREIGN KEY ("lhp_id") REFERENCES "tr_lhp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_lhp" ADD CONSTRAINT "tr_lhp_st_id_fkey" FOREIGN KEY ("st_id") REFERENCES "tr_surat_tugas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_temuan" ADD CONSTRAINT "tr_temuan_lhp_id_fkey" FOREIGN KEY ("lhp_id") REFERENCES "tr_lhp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_temuan" ADD CONSTRAINT "tr_temuan_kka_id_fkey" FOREIGN KEY ("kka_id") REFERENCES "tr_kka"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_temuan" ADD CONSTRAINT "tr_temuan_opd_id_fkey" FOREIGN KEY ("opd_id") REFERENCES "mst_opd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_rekomendasi" ADD CONSTRAINT "tr_rekomendasi_temuan_id_fkey" FOREIGN KEY ("temuan_id") REFERENCES "tr_temuan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_tindak_lanjut" ADD CONSTRAINT "tr_tindak_lanjut_rekomendasi_id_fkey" FOREIGN KEY ("rekomendasi_id") REFERENCES "tr_rekomendasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_bukti_tindak_lanjut" ADD CONSTRAINT "tr_bukti_tindak_lanjut_tindak_lanjut_id_fkey" FOREIGN KEY ("tindak_lanjut_id") REFERENCES "tr_tindak_lanjut"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_verifikasi_tindak_lanjut" ADD CONSTRAINT "tr_verifikasi_tindak_lanjut_tindak_lanjut_id_fkey" FOREIGN KEY ("tindak_lanjut_id") REFERENCES "tr_tindak_lanjut"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_verifikasi_tindak_lanjut" ADD CONSTRAINT "tr_verifikasi_tindak_lanjut_verifikator_id_fkey" FOREIGN KEY ("verifikator_id") REFERENCES "mst_pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_bukti" ADD CONSTRAINT "wbs_bukti_wbs_aduan_id_fkey" FOREIGN KEY ("wbs_aduan_id") REFERENCES "wbs_aduan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_chat" ADD CONSTRAINT "wbs_chat_wbs_aduan_id_fkey" FOREIGN KEY ("wbs_aduan_id") REFERENCES "wbs_aduan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_rekomendasi_penugasan_khusus" ADD CONSTRAINT "tr_rekomendasi_penugasan_khusus_wbs_aduan_id_fkey" FOREIGN KEY ("wbs_aduan_id") REFERENCES "wbs_aduan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_rekomendasi_penugasan_khusus" ADD CONSTRAINT "tr_rekomendasi_penugasan_khusus_rekomendator_id_fkey" FOREIGN KEY ("rekomendator_id") REFERENCES "mst_pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mst_regulasi" ADD CONSTRAINT "mst_regulasi_kategori_id_fkey" FOREIGN KEY ("kategori_id") REFERENCES "mst_kategori_regulasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_tiket_konsultasi" ADD CONSTRAINT "tr_tiket_konsultasi_opd_id_fkey" FOREIGN KEY ("opd_id") REFERENCES "mst_opd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_tiket_konsultasi" ADD CONSTRAINT "tr_tiket_konsultasi_irban_id_fkey" FOREIGN KEY ("irban_id") REFERENCES "mst_pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_tiket_konsultasi" ADD CONSTRAINT "tr_tiket_konsultasi_auditor_jawab_id_fkey" FOREIGN KEY ("auditor_jawab_id") REFERENCES "mst_pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_lampiran_konsultasi" ADD CONSTRAINT "tr_lampiran_konsultasi_tiket_id_fkey" FOREIGN KEY ("tiket_id") REFERENCES "tr_tiket_konsultasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rel_tiket_regulasi" ADD CONSTRAINT "rel_tiket_regulasi_tiket_id_fkey" FOREIGN KEY ("tiket_id") REFERENCES "tr_tiket_konsultasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rel_tiket_regulasi" ADD CONSTRAINT "rel_tiket_regulasi_regulasi_id_fkey" FOREIGN KEY ("regulasi_id") REFERENCES "mst_regulasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_kms_artikel" ADD CONSTRAINT "tr_kms_artikel_tiket_id_fkey" FOREIGN KEY ("tiket_id") REFERENCES "tr_tiket_konsultasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_kms_artikel" ADD CONSTRAINT "tr_kms_artikel_referensi_regulasi_id_fkey" FOREIGN KEY ("referensi_regulasi_id") REFERENCES "mst_regulasi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_metadata" ADD CONSTRAINT "doc_metadata_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "audit_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_chunks" ADD CONSTRAINT "doc_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "audit_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_item_audit_pbj" ADD CONSTRAINT "tr_item_audit_pbj_kka_id_fkey" FOREIGN KEY ("kka_id") REFERENCES "tr_kka"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opd_risk_assessments" ADD CONSTRAINT "opd_risk_assessments_opd_id_fkey" FOREIGN KEY ("opd_id") REFERENCES "mst_opd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_pka" ADD CONSTRAINT "tr_pka_st_id_fkey" FOREIGN KEY ("st_id") REFERENCES "tr_surat_tugas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
