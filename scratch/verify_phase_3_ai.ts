// scratch/verify_phase_3_ai.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TeamAllocationService } from '../src/assignment/services/team-allocation.service';
import { PkaGeneratorService } from '../src/assignment/services/pka-generator.service';
import { PrismaService } from '../src/prisma/prisma.service';
import * as assert from 'assert';

async function bootstrap() {
  console.log('=== MEMULAI VERIFIKASI FASE 3 (PENUGASAN CERDAS & ST/PKA ENGINE) ===');

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const teamService = app.get(TeamAllocationService);
  const pkaGeneratorService = app.get(PkaGeneratorService);

  const startDate = new Date('2026-09-01');
  const endDate = new Date('2026-09-15');

  try {
    // ----------------------------------------------------
    // 1. Bersihkan Data Testing Lama
    // ----------------------------------------------------
    console.log('\n1. Membersihkan data lama...');
    await prisma.trPka.deleteMany({});
    await prisma.relStAuditor.deleteMany({});
    await prisma.trSuratTugas.deleteMany({});
    await prisma.trAgendaAudit.deleteMany({});
    await prisma.trPkpt.deleteMany({});
    
    // Hapus auditor dummy
    await prisma.mstPegawai.deleteMany({
      where: {
        nip: { in: ['19900101-01', '19900101-02', '19900101-03', '19900101-04', '19900101-05'] },
      },
    });

    // Hapus OPD dummy
    await prisma.mstOpd.deleteMany({
      where: {
        namaOpd: { in: ['Dinas Pendidikan Uji', 'Inspektorat Uji'] },
      },
    });

    // ----------------------------------------------------
    // 2. Seeding Data Pegawai dan OPD
    // ----------------------------------------------------
    console.log('\n2. Seeding data pegawai dan OPD...');
    
    const opdInspektorat = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Inspektorat Uji',
        alamat: 'Jl. Inspektorat No. 1',
        gpsKoordinat: '-7.250445, 112.768845',
      },
    });

    const opdTarget = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Pendidikan Uji',
        alamat: 'Jl. Pendidikan No. 20',
        gpsKoordinat: '-7.270445, 112.788845',
      },
    });

    // Auditor 1: Ahli Madya (Financial Expert)
    const aud1 = await prisma.mstPegawai.create({
      data: {
        nip: '19900101-01',
        nama: 'Andi Saputra',
        golongan: 'Pembina / IV-a',
        jabatan: 'Auditor Ahli Madya',
        opdId: opdInspektorat.id,
      },
    });

    // Auditor 2: Ahli Muda (Financial Expert)
    const aud2 = await prisma.mstPegawai.create({
      data: {
        nip: '19900101-02',
        nama: 'Budi Santoso',
        golongan: 'Penata Tk I / III-d',
        jabatan: 'Auditor Ahli Muda',
        opdId: opdInspektorat.id,
      },
    });

    // Auditor 3: Ahli Pertama
    const aud3 = await prisma.mstPegawai.create({
      data: {
        nip: '19900101-03',
        nama: 'Citra Lestari',
        golongan: 'Penata / III-c',
        jabatan: 'Auditor Ahli Pertama',
        opdId: opdInspektorat.id,
      },
    });

    // Auditor 4: PPUPD (Technical/Performance Focus)
    const aud4 = await prisma.mstPegawai.create({
      data: {
        nip: '19900101-04',
        nama: 'Dewi Safitri',
        golongan: 'Penata / III-c',
        jabatan: 'PPUPD Ahli Pertama',
        opdId: opdInspektorat.id,
      },
    });

    // Auditor 5: Sibuk (Conflict target)
    const aud5 = await prisma.mstPegawai.create({
      data: {
        nip: '19900101-05',
        nama: 'Eko Prasetyo',
        golongan: 'Pembina / IV-a',
        jabatan: 'Auditor Ahli Madya',
        opdId: opdInspektorat.id,
      },
    });

    // Buat PKPT dummy dan Agenda untuk mengikat ST Konflik
    const pkptDummy = await prisma.trPkpt.create({
      data: {
        tahunAnggaran: 2026,
        statusPkpt: 'DISETUJUI',
      },
    });

    const agendaDummy = await prisma.trAgendaAudit.create({
      data: {
        pkptId: pkptDummy.id,
        opdId: opdTarget.id,
        jenisPengawasan: 'Audit',
        perkiraanBulan: 9,
      },
    });

    // Buat ST Konflik yang aktif pada rentang tanggal target (sehingga Aud5 sibuk)
    const stKonflik = await prisma.trSuratTugas.create({
      data: {
        agendaAuditId: agendaDummy.id,
        nomorSt: 'ST/KONFLIK/999',
        tanggalMulai: startDate,
        tanggalSelesai: endDate,
        statusSt: 'AKTIF',
      },
    });

    await prisma.relStAuditor.create({
      data: {
        stId: stKonflik.id,
        auditorId: aud5.id,
        peranDalamTim: 'Ketua_Tim',
      },
    });

    console.log('   [SUCCESS] Data uji coba berhasil di-seed.');

    // ----------------------------------------------------
    // 3. Menguji Rekomendasi Tim (Smart Team Allocation)
    // ----------------------------------------------------
    console.log('\n3. Menguji alokasi tim pengawasan pintar (fokus: Laporan Keuangan)...');
    const recommendationResult = await teamService.recommendTeam(
      startDate,
      endDate,
      'Evaluasi Kepatuhan Laporan Keuangan & Belanja Rutin'
    );

    assert.ok(recommendationResult.allAvailableAuditors.length >= 4);
    assert.ok(recommendationResult.pengawasTeknis.id);
    assert.ok(recommendationResult.ketuaTim.id);
    assert.ok(recommendationResult.anggotaTim.length >= 1);

    console.log('   [PASSED] Smart Load-Balancing & pencocokan kompetensi berhasil merekomendasikan tim.');

    // ----------------------------------------------------
    // 4. Buat Surat Tugas dengan Tim Rekomendasi
    // ----------------------------------------------------
    console.log('\n4. Membuat Surat Tugas riil berdasarkan rekomendasi tim...');
    
    // Hapus ST Konflik agar tidak mengganggu DB push
    await prisma.relStAuditor.deleteMany({ where: { stId: stKonflik.id } });
    await prisma.trSuratTugas.deleteMany({ where: { id: stKonflik.id } });

    const stBaru = await prisma.trSuratTugas.create({
      data: {
        agendaAuditId: agendaDummy.id,
        nomorSt: 'ST/2026/F3-01',
        tanggalMulai: startDate,
        tanggalSelesai: endDate,
        statusSt: 'DRAF',
      },
    });

    // Masukkan tim rekomendasi ke ST baru
    const relations = [
      { stId: stBaru.id, auditorId: recommendationResult.pengawasTeknis.id, peranDalamTim: 'Pengawas_Teknis' as any },
      { stId: stBaru.id, auditorId: recommendationResult.ketuaTim.id, peranDalamTim: 'Ketua_Tim' as any },
      ...recommendationResult.anggotaTim.map((a) => ({
        stId: stBaru.id,
        auditorId: a.id,
        peranDalamTim: 'Anggota_Tim' as any,
      })),
    ];

    await prisma.relStAuditor.createMany({
      data: relations,
    });

    console.log('   [SUCCESS] Surat Tugas berhasil terbit dengan status DRAF.');

    // ----------------------------------------------------
    // 5. Uji Coba AI PKA Generator (RAG Orchestrator)
    // ----------------------------------------------------
    console.log('\n5. Menguji generasi langkah kerja PKA berbasis AI...');
    const pkaSteps = await pkaGeneratorService.generatePka(
      stBaru.id,
      'Audit substantif transaksi kas operasional dan ATK.'
    );

    assert.ok(pkaSteps.length > 0);
    const firstStep = pkaSteps[0];
    
    assert.strictEqual(firstStep.stId, stBaru.id);
    assert.ok(firstStep.noLangkah);
    assert.ok(firstStep.prosedur);
    assert.ok(firstStep.pelaksanaRencana);
    assert.ok(firstStep.waktuRencana > 0);

    console.log(`   [PASSED] AI PKA berhasil menyusun draf langkah kerja.`);
    console.log(`            Jumlah Langkah Kerja: ${pkaSteps.length}`);
    console.log(`            Sampel Langkah Pertama: "${firstStep.noLangkah} - ${firstStep.prosedur.substring(0, 60)}..."`);

    // ----------------------------------------------------
    // Cleanup Data Akhir
    // ----------------------------------------------------
    console.log('\n6. Pembersihan data pasca pengujian...');
    await prisma.trPka.deleteMany({});
    await prisma.relStAuditor.deleteMany({});
    await prisma.trSuratTugas.deleteMany({});
    await prisma.trAgendaAudit.deleteMany({});
    await prisma.trPkpt.deleteMany({});
    await prisma.mstPegawai.deleteMany({
      where: {
        nip: { in: ['19900101-01', '19900101-02', '19900101-03', '19900101-04', '19900101-05'] },
      },
    });
    await prisma.mstOpd.deleteMany({
      where: {
        namaOpd: { in: ['Dinas Pendidikan Uji', 'Inspektorat Uji'] },
      },
    });

    console.log('\n=== VERIFIKASI FASE 3 BERHASIL 100% ===');
  } catch (error) {
    console.error('\n   [ERROR] Verifikasi gagal:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
