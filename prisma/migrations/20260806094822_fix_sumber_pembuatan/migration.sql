/*
  Warnings:

  - The `sumber_pembuatan` column on the `tr_item_audit_pbj` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'RKA_PERENCANAAN';
ALTER TYPE "DocumentType" ADD VALUE 'ADENDUM_JUSTIFIKASI';

-- DropForeignKey
ALTER TABLE "tr_tindak_lanjut" DROP CONSTRAINT "tr_tindak_lanjut_rekomendasi_id_fkey";

-- DropForeignKey
ALTER TABLE "tr_verifikasi_tindak_lanjut" DROP CONSTRAINT "tr_verifikasi_tindak_lanjut_tindak_lanjut_id_fkey";

-- AlterTable
ALTER TABLE "audit_documents" ADD COLUMN     "st_id" UUID;

-- AlterTable
ALTER TABLE "tr_item_audit_pbj" ADD COLUMN     "analisis_copilot" TEXT,
ADD COLUMN     "document_id" UUID,
DROP COLUMN "sumber_pembuatan",
ADD COLUMN     "sumber_pembuatan" "SumberPembuatan" NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "tr_lhp" ADD COLUMN     "substansi_nhp" JSONB,
ADD COLUMN     "sumber_pembuatan" "SumberPembuatan" NOT NULL DEFAULT 'SYSTEM';

-- AddForeignKey
ALTER TABLE "tr_tindak_lanjut" ADD CONSTRAINT "tr_tindak_lanjut_rekomendasi_id_fkey" FOREIGN KEY ("rekomendasi_id") REFERENCES "tr_rekomendasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_verifikasi_tindak_lanjut" ADD CONSTRAINT "tr_verifikasi_tindak_lanjut_tindak_lanjut_id_fkey" FOREIGN KEY ("tindak_lanjut_id") REFERENCES "tr_tindak_lanjut"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_documents" ADD CONSTRAINT "audit_documents_st_id_fkey" FOREIGN KEY ("st_id") REFERENCES "tr_surat_tugas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tr_item_audit_pbj" ADD CONSTRAINT "tr_item_audit_pbj_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "audit_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
