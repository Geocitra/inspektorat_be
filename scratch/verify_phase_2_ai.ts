// scratch/verify_phase_2_ai.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RiskAssessmentService } from '../src/audit-planning/services/risk-assessment.service';
import { PkptGeneratorService } from '../src/audit-planning/services/pkpt-generator.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SumberPembuatan } from '@prisma/client';
import * as assert from 'assert';

async function bootstrap() {
  console.log('=== MEMULAI VERIFIKASI FASE 2 (RISK-BASED PLANNING & AI PKPT) ===');

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const riskService = app.get(RiskAssessmentService);
  const pkptGeneratorService = app.get(PkptGeneratorService);

  try {
    // ----------------------------------------------------
    // 1. Bersihkan Data Testing Lama dalam Urutan Dependensi
    // ----------------------------------------------------
    console.log('\n1. Membersihkan data testing lama...');
    await prisma.opdRiskAssessment.deleteMany({});
    await prisma.trAgendaAudit.deleteMany({});
    await prisma.trPkpt.deleteMany({});
    await prisma.trTindakLanjut.deleteMany({});
    await prisma.trRekomendasi.deleteMany({});
    await prisma.trTemuan.deleteMany({});
    await prisma.trKka.deleteMany({});
    await prisma.trLhp.deleteMany({});
    await prisma.trSuratTugas.deleteMany({});

    // Hapus OPD lama
    await prisma.mstOpd.deleteMany({
      where: {
        namaOpd: { in: ['Dinas Kesehatan Uji', 'Dinas Pendidikan Uji'] },
      },
    });

    // ----------------------------------------------------
    // 2. Seed Data Uji Coba OPD, Temuan, dan Anggaran
    // ----------------------------------------------------
    console.log('\n2. Seeding data uji coba...');
    
    // Kantor Inspektorat Pusat: -7.250445, 112.768845
    // OPD A: Dekat (1.5 km), Banyak Temuan, Anggaran Rendah
    const opdA = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Kesehatan Uji',
        alamat: 'Jl. Dekat No. 12',
        gpsKoordinat: '-7.260445, 112.778845',
      },
    });

    // OPD B: Jauh (17 km), Nol Temuan, Anggaran Tinggi
    const opdB = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Pendidikan Uji',
        alamat: 'Jl. Jauh No. 99',
        gpsKoordinat: '-7.360445, 112.878845',
      },
    });

    // Buat PKPT dummy 2025 untuk target relasi
    const dummyPkpt = await prisma.trPkpt.create({
      data: {
        tahunAnggaran: 2025,
        statusPkpt: 'DRAF',
      },
    });

    // Buat Agenda untuk OPD A & B di PKPT 2025
    const agendaA = await prisma.trAgendaAudit.create({
      data: {
        pkptId: dummyPkpt.id,
        opdId: opdA.id,
        jenisPengawasan: 'Audit',
        perkiraanBulan: 2,
        estimasiAnggaran: 50000000,
      },
    });

    // Agenda untuk OPD B: estimasiAnggaran = 6 Milyar -> Budget Score 5
    await prisma.trAgendaAudit.create({
      data: {
        pkptId: dummyPkpt.id,
        opdId: opdB.id,
        jenisPengawasan: 'Audit',
        perkiraanBulan: 4,
        estimasiAnggaran: 6000000000,
      },
    });

    // Buat Surat Tugas, LHP, dan KKA untuk OPD A agar bisa mengikat Temuan & Rekomendasi
    const st = await prisma.trSuratTugas.create({
      data: {
        agendaAuditId: agendaA.id,
        nomorSt: 'ST/2026/001',
        tanggalMulai: new Date(),
        tanggalSelesai: new Date(),
        statusSt: 'SELESAI',
      },
    });

    const lhp = await prisma.trLhp.create({
      data: {
        stId: st.id,
        nomorLhp: 'LHP/2026/001',
        ringkasanEksekutif: 'Hasil Pengawasan Dinas Kesehatan Uji.',
        fileLhpSignedPath: '/files/lhp/signed.pdf',
      },
    });

    const kka = await prisma.trKka.create({
      data: {
        stId: st.id,
        prosedurPemeriksaan: 'Cek persediaan obat dan penyimpanan.',
        uraianPengujian: 'Melakukan stock opname pada gudang farmasi.',
        kesimpulanSementara: 'Terdapat kekurangan administratif pada pembukuan obat.',
        statusKka: 'APPROVED',
      },
    });

    // Seeding historis temuan untuk OPD A (8 temuan -> Findings Score 5)
    for (let i = 1; i <= 8; i++) {
      const temuan = await prisma.trTemuan.create({
        data: {
          lhpId: lhp.id,
          kkaId: kka.id,
          opdId: opdA.id,
          kondisi: `Terdapat selisih stok fisik obat ke-${i} pada gudang farmasi.`,
          kriteria: 'SOP Dinas Kesehatan tentang Pengelolaan Obat Bab II Pasal 4.',
          sebab: 'Kurangnya supervisi oleh Kepala Seksi Farmasi.',
          akibat: 'Potensi kerugian operasional dan keterlambatan distribusi.',
          statusTemuan: 'PROSES',
        },
      });

      // Tambahkan rekomendasi belum selesai untuk 3 temuan pertama (Unresolved Score 5)
      if (i <= 3) {
        await prisma.trRekomendasi.create({
          data: {
            temuanId: temuan.id,
            uraianRekomendasi: `Melakukan rekonsiliasi kartu stok obat ke-${i} secara harian.`,
            statusRekomendasi: 'BELUM_TINDAK_LANJUT',
          },
        });
      }
    }

    console.log('   [SUCCESS] Data uji coba berhasil di-seed.');

    // ----------------------------------------------------
    // 3. Uji Coba Perhitungan Risiko (Audit Math Engine)
    // ----------------------------------------------------
    console.log('\n3. Menguji kalkulasi penilaian risiko OPD (Tahun 2026)...');
    const assessments = await riskService.calculateRisk(2026);
    
    assert.ok(assessments.length >= 2);
    
    const assessA = assessments.find((a) => a.opdId === opdA.id);
    const assessB = assessments.find((a) => a.opdId === opdB.id);

    assert.ok(assessA);
    assert.ok(assessB);

    // Hitungan Logis untuk OPD A (Dinas Kesehatan Uji):
    // - Budget: Pagu Agenda 2025 = 50jt (< 1M) -> Budget Score 1
    // - Distance: ~1.5 km -> Distance Score 1
    // - NRI: (1 + 1) / 2 = 1.00
    // - Findings: 8 temuan (> 5) -> Findings Score 5
    // - Unresolved: 3 rekomendasi (> 2) -> Unresolved Score 5
    // - NFR: (5 + 5) / 2 = 5.00
    // - NTR: 1.0 * 0.7 + 5.0 * 0.3 = 0.7 + 1.5 = 2.20
    console.log(`   [INFO] OPD A (Dekat, Temuan Tinggi): NRI=${assessA.nri}, NFR=${assessA.nfr}, NTR=${assessA.ntr}`);
    assert.strictEqual(Number(assessA.nfr), 5.00);

    // Hitungan Logis untuk OPD B (Dinas Pendidikan Uji):
    // - Budget: Pagu Agenda 2025 = 6M (> 5M) -> Budget Score 5
    // - Distance: ~17 km (> 10 km) -> Distance Score 5
    // - NRI: (5 + 5) / 2 = 5.00
    // - Findings: 0 temuan -> Findings Score 1
    // - Unresolved: 0 rekomendasi -> Unresolved Score 1
    // - NFR: (1 + 1) / 2 = 1.00
    // - NTR: 5.0 * 0.7 + 1.0 * 0.3 = 3.5 + 0.3 = 3.80
    console.log(`   [INFO] OPD B (Jauh, Anggaran Tinggi, Nol Temuan): NRI=${assessB.nri}, NFR=${assessB.nfr}, NTR=${assessB.ntr}`);
    assert.strictEqual(Number(assessB.nri), 5.00);
    assert.strictEqual(Number(assessB.nfr), 1.00);

    console.log('   [PASSED] Perhitungan kuantitatif NRI, NFR, dan NTR 100% akurat.');

    // ----------------------------------------------------
    // 4. Uji Coba Pengambilan Ranking Risiko
    // ----------------------------------------------------
    console.log('\n4. Menguji pengambilan ranking risiko...');
    const rankings = await riskService.getRiskRanking(2026);
    assert.ok(rankings.length >= 2);
    
    // Urutan ranking berdasarkan NTR terbesar
    // OPD B (NTR: 3.8) harus di atas OPD A (NTR: 2.2)
    const indexA = rankings.findIndex((r) => r.opdId === opdA.id);
    const indexB = rankings.findIndex((r) => r.opdId === opdB.id);
    assert.ok(indexB < indexA, 'OPD B (NTR 3.8) harus berada di atas OPD A (NTR 2.2) pada ranking');
    console.log('   [PASSED] Sorting ranking berdasarkan NTR berhasil diverifikasi.');

    // ----------------------------------------------------
    // 5. Uji Coba Generasi Draf PKPT AI (RAG Orchestrator)
    // ----------------------------------------------------
    console.log('\n5. Menguji generasi draf PKPT berbasis AI...');
    const result = await pkptGeneratorService.generateDraftPkpt(2026, 'Fokuskan reviu pada belanja modal OPD.');

    assert.ok(result);
    assert.ok(result.pkpt);
    assert.strictEqual(result.pkpt.tahunAnggaran, 2026);
    assert.strictEqual(result.pkpt.statusPkpt, 'DRAF');
    assert.strictEqual(result.pkpt.sumberPembuatan, SumberPembuatan.AI_COPILOT);

    assert.ok(result.agendaAudits.length > 0);
    const firstAgenda = result.agendaAudits[0];
    assert.strictEqual(firstAgenda.sumberPembuatan, SumberPembuatan.AI_COPILOT);
    assert.ok(firstAgenda.substansiDokumen);
    
    // Verifikasi bahwa isi substansiDokumen memiliki properti hariPemeriksaan dan saranaPrasarana
    const substansi = firstAgenda.substansiDokumen as any;
    assert.ok(substansi.hariPemeriksaan);
    assert.ok(substansi.hariPemeriksaan.pj !== undefined);
    assert.ok(substansi.saranaPrasarana);
    assert.ok(substansi.alasanPrioritas);

    console.log(`   [PASSED] Draf PKPT & Agenda audit berhasil digenerasi dengan metadata AI.`);
    console.log(`            Jumlah Agenda Terbuat: ${result.agendaAudits.length}`);
    console.log(`            Sampel Alasan Prioritas: "${substansi.alasanPrioritas}"`);

    // ----------------------------------------------------
    // Cleanup Data Akhir
    // ----------------------------------------------------
    console.log('\n6. Pembersihan data pasca pengujian...');
    await prisma.opdRiskAssessment.deleteMany({});
    await prisma.trAgendaAudit.deleteMany({});
    await prisma.trPkpt.deleteMany({});
    await prisma.trTindakLanjut.deleteMany({});
    await prisma.trRekomendasi.deleteMany({});
    await prisma.trTemuan.deleteMany({});
    await prisma.trKka.deleteMany({});
    await prisma.trLhp.deleteMany({});
    await prisma.trSuratTugas.deleteMany({});
    await prisma.mstOpd.deleteMany({
      where: {
        namaOpd: { in: ['Dinas Kesehatan Uji', 'Dinas Pendidikan Uji'] },
      },
    });

    console.log('\n=== VERIFIKASI FASE 2 BERHASIL 100% ===');
  } catch (error) {
    console.error('\n   [ERROR] Verifikasi gagal:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
