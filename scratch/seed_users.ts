// scratch/seed_users.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SystemRole } from '@prisma/client';

// Bcrypt hash dari 'password123'
const BCRYPT_PASSWORD_HASH = '$2b$10$nQDpW9W3N97HnK6/s14DSeYq.fV.t1sN52zEubmRkE1GZg.uC9pXe';

async function bootstrap() {
  console.log('=== MEMULAI PROSES RESET DATABASE & SEEDING USER ===');

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    // 1. Membersihkan database dari seluruh data transaksi & master lama secara berurutan menggunakan raw SQL TRUNCATE CASCADE
    console.log('   -> Membersihkan seluruh tabel di database menggunakan CASCADE...');
    
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "users", 
        "tr_pka", 
        "tr_kka", 
        "tr_lhp",
        "tr_temuan", 
        "tr_rekomendasi", 
        "tr_tindak_lanjut", 
        "tr_bukti_tindak_lanjut", 
        "tr_verifikasi_tindak_lanjut", 
        "sec_append_only_log", 
        "wbs_aduan", 
        "wbs_bukti", 
        "wbs_chat", 
        "tr_rekomendasi_penugasan_khusus", 
        "mst_kategori_regulasi", 
        "mst_regulasi", 
        "tr_tiket_konsultasi", 
        "tr_lampiran_konsultasi", 
        "rel_tiket_regulasi", 
        "tr_kms_artikel", 
        "audit_documents", 
        "doc_metadata", 
        "doc_chunks", 
        "tr_item_audit_pbj", 
        "opd_risk_assessments", 
        "rel_st_auditor", 
        "tr_surat_tugas", 
        "tr_agenda_audit", 
        "tr_pkpt", 
        "mst_pegawai", 
        "mst_opd" 
      CASCADE;
    `);
    
    console.log('   [SUCCESS] Database bersih dari data lama.');

    // 2. Seeding Master OPD untuk Admin OPD & Kantor Inspektorat
    // Kami mengintegrasikan seluruh OPD yang ada pada Excel PKPT Anda agar Fuzzy Matching AI 100% akurat.
    console.log('\n   -> Seeding data Master OPD sesuai Excel PKPT...');
    
    const opdInspektorat = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Inspektorat Daerah',
        alamat: 'Jl. Pemuda No. 1 (Kantor Inspektorat)',
        gpsKoordinat: '-7.250445, 112.768845', // Titik Pusat Referensi
      },
    });

    const opdDisdik = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Pendidikan',
        alamat: 'Jl. Pendidikan No. 10',
        gpsKoordinat: '-7.300445, 112.808845', // ~7.1 km (Skor Jarak: 3)
      },
    });

    const opdDinkes = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Kesehatan',
        alamat: 'Jl. Kesehatan No. 22',
        gpsKoordinat: '-7.350445, 112.858845', // ~15.2 km (Skor Jarak: 5 - Tinggi)
      },
    });

    const opdDishub = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Perhubungan',
        alamat: 'Jl. Perhubungan No. 5',
        gpsKoordinat: '-7.320445, 112.818845', // ~9.4 km (Skor Jarak: 3)
      },
    });

    const opdDamkar = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Pemadam Kebakaran dan Penyelamatan',
        alamat: 'Jl. Pemadam No. 12',
        gpsKoordinat: '-7.240445, 112.758845', // ~1.5 km (Skor Jarak: 1)
      },
    });

    const opdLh = await prisma.mstOpd.create({
      data: {
        namaOpd: 'Dinas Lingkungan Hidup',
        alamat: 'Jl. Kebersihan No. 4',
        gpsKoordinat: '-7.230445, 112.748845', // ~3.1 km (Skor Jarak: 1)
      },
    });

    const opdDbmsda = await prisma.mstOpd.create({
      data: {
        namaOpd: 'DBMSDA',
        alamat: 'Jl. Bina Marga No. 8',
        gpsKoordinat: '-7.210445, 112.728845', // ~6.2 km (Skor Jarak: 3)
      },
    });

    const opdDisperkimtan = await prisma.mstOpd.create({
      data: {
        namaOpd: 'DISPERKIMTAN',
        alamat: 'Jl. Perumahan Indah No. 3',
        gpsKoordinat: '-7.190445, 112.708845', // ~9.3 km (Skor Jarak: 3)
      },
    });

    const opdRsud = await prisma.mstOpd.create({
      data: {
        namaOpd: 'RSUD',
        alamat: 'Jl. Rumah Sakit Umum No. 1',
        gpsKoordinat: '-7.330445, 112.828845', // ~11.1 km (Skor Jarak: 5 - Tinggi)
      },
    });

    console.log('   [SUCCESS] Seluruh Master OPD Excel berhasil ditambahkan.');

    // 3. Seeding data Master Pegawai untuk Internal Inspektorat (wajib di-link ke opdId Inspektorat)
    console.log('\n   -> Seeding data Master Pegawai (Staf Inspektorat)...');
    
    const pegKasubag = await prisma.mstPegawai.create({
      data: {
        nip: '19850101-01',
        nama: 'Ahmad Kasubag',
        golongan: 'Penata / III-c',
        jabatan: 'Kasubag Penugasan',
        opdId: opdInspektorat.id,
      },
    });

    const pegInspektur = await prisma.mstPegawai.create({
      data: {
        nip: '19700101-01',
        nama: 'Hartono Inspektur',
        golongan: 'Pembina Utama / IV-c',
        jabatan: 'Inspektur Daerah',
        opdId: opdInspektorat.id,
      },
    });

    const auditors = [];
    for (let i = 1; i <= 4; i++) {
      const peg = await prisma.mstPegawai.create({
        data: {
          nip: `19900101-0${i}`,
          nama: `Auditor Senior ${i}`,
          golongan: 'Penata Tk I / III-d',
          jabatan: `Auditor Ahli Muda ${i}`,
          opdId: opdInspektorat.id,
        },
      });
      auditors.push(peg);
    }
    console.log('   [SUCCESS] Master Pegawai ditambahkan.');

    // 4. Seeding Tepat 10 Akun Pengguna (Users)
    console.log('\n   -> Seeding 10 Akun Pengguna (Users)...');

    const usersData = [
      // 1. Kasubag (APIP_INTERNAL)
      {
        email: 'kasubag@inspektorat.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.APIP_INTERNAL,
        pegawaiId: pegKasubag.id,
      },
      // 2. Inspektur (APIP_PIMPINAN)
      {
        email: 'inspektur@inspektorat.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.APIP_PIMPINAN,
        pegawaiId: pegInspektur.id,
      },
      // 3. Admin Dinas Pendidikan (AUDITEE_OPD)
      {
        email: 'disdik@pemda.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.AUDITEE_OPD,
        opdId: opdDisdik.id,
      },
      // 4. Kepala Daerah (KEPALA_DAERAH)
      {
        email: 'bupati@pemda.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.KEPALA_DAERAH,
      },
      // 5. Auditor 1 (APIP_INTERNAL)
      {
        email: 'auditor1@inspektorat.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.APIP_INTERNAL,
        pegawaiId: auditors[0].id,
      },
      // 6. Auditor 2 (APIP_INTERNAL)
      {
        email: 'auditor2@inspektorat.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.APIP_INTERNAL,
        pegawaiId: auditors[1].id,
      },
      // 7. Auditor 3 (APIP_INTERNAL)
      {
        email: 'auditor3@inspektorat.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.APIP_INTERNAL,
        pegawaiId: auditors[2].id,
      },
      // 8. Auditor 4 (APIP_INTERNAL)
      {
        email: 'auditor4@inspektorat.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.APIP_INTERNAL,
        pegawaiId: auditors[3].id,
      },
      // 9. Admin Dinas Kesehatan (AUDITEE_OPD)
      {
        email: 'dinkes@pemda.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.AUDITEE_OPD,
        opdId: opdDinkes.id,
      },
      // 10. Admin Dinas Perhubungan (AUDITEE_OPD)
      {
        email: 'dishub@pemda.go.id',
        password: BCRYPT_PASSWORD_HASH,
        role: SystemRole.AUDITEE_OPD,
        opdId: opdDishub.id,
      },
    ];

    for (const u of usersData) {
      await prisma.user.create({ data: u });
    }

    console.log('   [SUCCESS] Tepat 10 Akun Pengguna berhasil di-seed.');

    // 5. Verifikasi Akhir
    const totalUsers = await prisma.user.count();
    const allUsers = await prisma.user.findMany({ select: { email: true, role: true } });
    
    console.log('\n=== REKAP AKUN PENGGUNA TERSEDIA ===');
    console.log(`Total User di Database: ${totalUsers}`);
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email.padEnd(30)} | Role: ${user.role}`);
    });

    console.log('\n=== SEEDING SELESAI & DATABASE BERSIH ===');
  } catch (error: any) {
    console.error('\n[ERROR] Proses seeding gagal:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
