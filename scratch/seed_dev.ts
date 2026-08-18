// scratch/seed_dev.ts
import { PrismaClient, SystemRole, SumberData, StatusPkpt, StatusSt, PeranSt, StatusKka, StatusTemuan, StatusRekomendasi, StatusTindakLanjut, StatusWbs, StatusTiket } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== MEMULAI GLOBAL DATABASE SEEDING ===');

  // 1. Pembersihan data secara total dengan urutan dependensi aman
  console.log('Membersihkan seluruh data lama...');
  await prisma.trPka.deleteMany({});
  await prisma.relStAuditor.deleteMany({});
  await prisma.trBuktiTindakLanjut.deleteMany({});
  await prisma.trVerifikasiTindakLanjut.deleteMany({});
  await prisma.trTindakLanjut.deleteMany({});
  await prisma.trRekomendasi.deleteMany({});
  await prisma.trTemuan.deleteMany({});
  await prisma.trKka.deleteMany({});
  await prisma.trLhp.deleteMany({});
  await prisma.trSuratTugas.deleteMany({});
  await prisma.trAgendaAudit.deleteMany({});
  await prisma.trPkpt.deleteMany({});
  await prisma.wbsChat.deleteMany({});
  await prisma.wbsBukti.deleteMany({});
  await prisma.trRekomendasiPenugasanKhusus.deleteMany({});
  await prisma.wbsAduan.deleteMany({});
  await prisma.relTiketRegulasi.deleteMany({});
  await prisma.trLampiranKonsultasi.deleteMany({});
  await prisma.trKmsArtikel.deleteMany({});
  await prisma.trTiketKonsultasi.deleteMany({});
  await prisma.mstRegulasi.deleteMany({});
  await prisma.mstKategoriRegulasi.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.mstPegawai.deleteMany({});
  await prisma.mstOpd.deleteMany({});

  // 2. Seed Master Data: OPD
  console.log('Seeding OPD...');
  const opdInspektorat = await prisma.mstOpd.create({
    data: {
      id: '11111111-1111-1111-1111-111111111111',
      namaOpd: 'Inspektorat Kota Surabaya',
      alamat: 'Jl. Jimerto No. 25-27, Surabaya',
      gpsKoordinat: '-7.250445,112.768845',
    },
  });

  const opdPendidikan = await prisma.mstOpd.create({
    data: {
      id: '22222222-2222-2222-2222-222222222222',
      namaOpd: 'Dinas Pendidikan',
      alamat: 'Jl. Jimerto No. 29, Surabaya',
      gpsKoordinat: '-7.270445,112.788845',
    },
  });

  const opdKesehatan = await prisma.mstOpd.create({
    data: {
      id: '33333333-3333-3333-3333-333333333333',
      namaOpd: 'Dinas Kesehatan',
      alamat: 'Jl. Jimerto No. 31, Surabaya',
      gpsKoordinat: '-7.360445,112.878845',
    },
  });

  const opdPu = await prisma.mstOpd.create({
    data: {
      id: '44444444-4444-4444-4444-444444444444',
      namaOpd: 'Dinas Pekerjaan Umum dan Penataan Ruang',
      alamat: 'Jl. Jimerto No. 33, Surabaya',
      gpsKoordinat: '-7.280445,112.798845',
    },
  });

  // 3. Seed Master Data: Pegawai
  console.log('Seeding Pegawai...');
  const pegKasubag = await prisma.mstPegawai.create({
    data: {
      id: 'aa111111-1111-1111-1111-111111111111',
      nip: '198001012005011001',
      nama: 'Hendro Wibowo, S.E.',
      golongan: 'Penata / III-c',
      jabatan: 'Kasubag Perencanaan',
      opdId: opdInspektorat.id,
      sumberData: SumberData.MANUAL,
    },
  });

  const pegInspektur = await prisma.mstPegawai.create({
    data: {
      id: 'bb222222-2222-2222-2222-222222222222',
      nip: '197005121995121002',
      nama: 'Dr. Ahmad Yani, M.H.',
      golongan: 'Pembina Utama / IV-c',
      jabatan: 'Inspektur Utama',
      opdId: opdInspektorat.id,
      sumberData: SumberData.MANUAL,
    },
  });

  const pegAuditor1 = await prisma.mstPegawai.create({
    data: {
      id: 'cc333333-3333-3333-3333-333333333333',
      nip: '197805122002121003',
      nama: 'Ir. Heru Prasetyo, M.T., CFrA',
      golongan: 'Pembina / IV-a',
      jabatan: 'Auditor Ahli Madya',
      opdId: opdInspektorat.id,
      sumberData: SumberData.MANUAL,
    },
  });

  const pegAuditor2 = await prisma.mstPegawai.create({
    data: {
      id: 'dd444444-4444-4444-4444-444444444444',
      nip: '198509202010012005',
      nama: 'Rina Wulandari, S.E., Ak., CA',
      golongan: 'Penata Tk I / III-d',
      jabatan: 'Auditor Ahli Muda',
      opdId: opdInspektorat.id,
      sumberData: SumberData.MANUAL,
    },
  });

  const pegAuditor3 = await prisma.mstPegawai.create({
    data: {
      id: 'ee555555-5555-5555-5555-555555555555',
      nip: '199101142015031002',
      nama: 'Ahmad Sobirin, S.Kom., CISA',
      golongan: 'Penata / III-c',
      jabatan: 'Auditor Ahli Pertama',
      opdId: opdInspektorat.id,
      sumberData: SumberData.MANUAL,
    },
  });

  // 4. Seed Autentikasi: Users
  console.log('Seeding Users...');
  const passwordHash = '$2b$10$wN9a56QZ0kQc1F.gQv8OJu1L0Fwz2RzY6e7Z0E9r9N8i/g0z5o23.'; // "password123"

  await prisma.user.create({
    data: {
      id: '55555555-5555-5555-5555-555555555555',
      email: 'kasubag.perencanaan@inspektorat.go.id',
      password: passwordHash,
      role: SystemRole.APIP_INTERNAL,
      pegawaiId: pegKasubag.id,
    },
  });

  await prisma.user.create({
    data: {
      id: '66666666-6666-6666-6666-666666666666',
      email: 'inspektur.utama@inspektorat.go.id',
      password: passwordHash,
      role: SystemRole.APIP_PIMPINAN,
      pegawaiId: pegInspektur.id,
    },
  });

  await prisma.user.create({
    data: {
      id: '77777777-7777-7777-7777-777777777777',
      email: 'auditor.budi@inspektorat.go.id',
      password: passwordHash,
      role: SystemRole.APIP_INTERNAL,
      pegawaiId: pegAuditor1.id,
    },
  });

  await prisma.user.create({
    data: {
      id: '88888888-8888-8888-8888-888888888888',
      email: 'dinas.pendidikan@surabaya.go.id',
      password: passwordHash,
      role: SystemRole.AUDITEE_OPD,
      opdId: opdPendidikan.id,
    },
  });

  // 5. Seed Klaster A (Audit): PKPT, Agenda, & Surat Tugas
  console.log('Seeding Klaster A (Audit Planning)...');
  const pkpt2026 = await prisma.trPkpt.create({
    data: {
      id: '00000000-0000-0000-0000-000000002026',
      tahunAnggaran: 2026,
      statusPkpt: StatusPkpt.DRAF,
    },
  });

  const agenda1 = await prisma.trAgendaAudit.create({
    data: {
      id: '11111111-1111-1111-1111-111111112026',
      pkptId: pkpt2026.id,
      opdId: opdPendidikan.id,
      jenisPengawasan: 'Audit',
      perkiraanBulan: 8,
      estimasiAnggaran: 150000000,
      substansiDokumen: {
        namaAudit: 'Audit Kepatuhan SPJ Belanja Daerah',
        hariPemeriksaan: { pj: 10, kt: 15, at: 15 },
        saranaPrasarana: 'Ruang Rapat & Akses Dokumen SPJ',
        alasanPrioritas: 'Nilai anggaran belanja besar dan anomali PBJ tinggi.',
      },
    },
  });

  const agenda2 = await prisma.trAgendaAudit.create({
    data: {
      id: '22222222-2222-2222-2222-222222222026',
      pkptId: pkpt2026.id,
      opdId: opdKesehatan.id,
      jenisPengawasan: 'Reviu',
      perkiraanBulan: 9,
      estimasiAnggaran: 75000000,
      substansiDokumen: {
        namaAudit: 'Reviu Tata Kelola IT E-Audit',
        hariPemeriksaan: { pj: 5, kt: 10, at: 10 },
        saranaPrasarana: 'Log Server & Dokumen Tatakelola IT',
        alasanPrioritas: 'Audit kepatuhan sistem keamanan TI berkala.',
      },
    },
  });

  console.log('Seeding Surat Tugas & KKA...');
  const st1 = await prisma.trSuratTugas.create({
    data: {
      id: '99999999-9999-9999-9999-999999999999',
      agendaAuditId: agenda1.id,
      nomorSt: 'ST/001/IP/2026',
      tanggalMulai: new Date('2026-08-10'),
      tanggalSelesai: new Date('2026-08-20'),
      statusSt: StatusSt.AKTIF,
      signedAt: new Date('2026-08-11T09:00:00Z'),
    },
  });

  // Hubungkan Tim Auditor ke Surat Tugas
  await prisma.relStAuditor.createMany({
    data: [
      {
        stId: st1.id,
        auditorId: pegInspektur.id,
        peranDalamTim: PeranSt.Pengawas_Teknis,
      },
      {
        stId: st1.id,
        auditorId: pegAuditor1.id,
        peranDalamTim: PeranSt.Ketua_Tim,
      },
      {
        stId: st1.id,
        auditorId: pegAuditor2.id,
        peranDalamTim: PeranSt.Anggota_Tim,
      },
    ],
  });

  const kka1 = await prisma.trKka.create({
    data: {
      id: 'cccc3333-3333-3333-3333-333333333333',
      stId: st1.id,
      prosedurPemeriksaan: 'Melakukan pencocokan scan bukti kuitansi belanja dengan laporan Excel SPJ',
      uraianPengujian: 'Melakukan stock opname pada gudang belanja fisik',
      kesimpulanSementara: 'Ditemukan ketidakcocokan administratif pada SPJ',
      statusKka: StatusKka.APPROVED,
    },
  });

  // 6. Seed Klaster B (WBS)
  console.log('Seeding Klaster B (WBS)...');
  const wbs1 = await prisma.wbsAduan.create({
    data: {
      id: 'b1b1b1b1-1111-1111-1111-111111111111',
      tokenPelacakan: 'WBS-TOKEN-12345',
      kategori: 'Tipikor',
      deskripsi: 'Terdapat indikasi markup anggaran pengadaan komputer di Dinas Pendidikan.',
      status: StatusWbs.Butuh_Klarifikasi,
    },
  });

  await prisma.wbsChat.create({
    data: {
      id: 'c1c1c1c1-1111-1111-1111-111111111111',
      wbsAduanId: wbs1.id,
      sender: 'Investigator',
      pesan: 'Mohon lampirkan bukti kuitansi atau dokumen pendukung terkait pengadaan tersebut.',
    },
  });

  // 7. Seed Klaster C (TLHP): LHP, Temuan, Rekomendasi, TL
  console.log('Seeding Klaster C (TLHP)...');
  const lhp1 = await prisma.trLhp.create({
    data: {
      id: 'aaaa1111-1111-1111-1111-111111111111',
      stId: st1.id,
      nomorLhp: 'LHP/001/IP/2026',
      ringkasanEksekutif: 'Hasil pemeriksaan kepatuhan belanja daerah Kota Surabaya.',
      fileLhpSignedPath: '/storage/lhp/lhp-signed.pdf',
      signedAt: new Date(),
    },
  });

  const temuan1 = await prisma.trTemuan.create({
    data: {
      id: 'bbbb2222-2222-2222-2222-222222222222',
      lhpId: lhp1.id,
      kkaId: kka1.id,
      opdId: opdPendidikan.id,
      kondisi: 'Terdapat selisih volume beton pada konstruksi halaman sekolah.',
      kriteria: 'Spesifikasi Teknis Kontrak Pengadaan Halaman Sekolah Pasal 4.',
      sebab: 'Kurangnya supervisi lapangan oleh PPK Dinas Pendidikan.',
      akibat: 'Potensi kerugian negara senilai Rp 50.000.000.',
      statusTemuan: StatusTemuan.PROSES,
    },
  });

  const rek1 = await prisma.trRekomendasi.create({
    data: {
      id: 'dddd4444-4444-4444-4444-444444444444',
      temuanId: temuan1.id,
      uraianRekomendasi: 'Mengembalikan kelebihan bayar senilai Rp 50.000.000 ke rekening Kas Daerah.',
      nilaiTuntutanFinansial: 50000000,
      statusRekomendasi: StatusRekomendasi.BELUM_TINDAK_LANJUT,
    },
  });

  const tl1 = await prisma.trTindakLanjut.create({
    data: {
      id: 'eeee5555-5555-5555-5555-555555555555',
      rekomendasiId: rek1.id,
      uraianTindakan: 'Telah melakukan penyetoran pengembalian dana senilai Rp 50.000.000 ke Kas Daerah Kota Surabaya.',
      statusTindakLanjut: StatusTindakLanjut.MENUNGGU_VERIFIKASI,
    },
  });

  await prisma.trBuktiTindakLanjut.create({
    data: {
      id: 'ffff6666-6666-6666-6666-666666666666',
      tindakLanjutId: tl1.id,
      filePath: '/storage/tl/bukti-transfer.jpg',
      gpsLatitude: -7.270445,
      gpsLongitude: 112.788845,
      timestampMetadata: new Date(),
    },
  });

  // 8. Seed Klaster D (Klinik): Regulasi & Tiket Konsultasi
  console.log('Seeding Klaster D (Klinik)...');
  const katReg = await prisma.mstKategoriRegulasi.create({
    data: {
      id: 'a1a1a1a1-1111-1111-1111-111111111111',
      namaKategori: 'Keuangan & Pengadaan',
    },
  });

  // Generate vector dummy 1536 floats
  const dummyEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i) * 0.1);

  await prisma.mstRegulasi.create({
    data: {
      id: 'd1d1d1d1-1111-1111-1111-111111111111',
      kategoriId: katReg.id,
      nomorRegulasi: 'Permendagri 77/2020',
      tentang: 'Pedoman Teknis Pengelolaan Keuangan Daerah',
      kontenTeks: 'Seluruh pengeluaran belanja daerah wajib didukung oleh bukti pertanggungjawaban yang lengkap dan sah.',
      tahunTerbit: 2020,
      embedding: dummyEmbedding,
    },
  });

  await prisma.mstRegulasi.create({
    data: {
      id: 'd2d2d2d2-2222-2222-2222-222222222222',
      kategoriId: katReg.id,
      nomorRegulasi: 'Perpres 12/2021',
      tentang: 'Pengadaan Barang/Jasa Pemerintah',
      kontenTeks: 'Metode pengadaan barang/jasa dapat dilakukan melalui e-purchasing, penunjukan langsung, atau tender.',
      tahunTerbit: 2021,
      embedding: dummyEmbedding,
    },
  });

  await prisma.mstRegulasi.create({
    data: {
      id: 'd3d3d3d3-3333-3333-3333-333333333333',
      kategoriId: katReg.id,
      nomorRegulasi: 'Perda 1/2023',
      tentang: 'Pajak Daerah dan Retribusi Daerah',
      kontenTeks: 'Pajak daerah dipungut atas jasa pelayanan, hotel, restoran, hiburan, dan retribusi perizinan tertentu.',
      tahunTerbit: 2023,
      embedding: dummyEmbedding,
    },
  });

  await prisma.trTiketKonsultasi.create({
    data: {
      id: 'f1f1f1f1-1111-1111-1111-111111111111',
      opdId: opdPendidikan.id,
      nomorTiket: 'TKT-2026-0001',
      judulPertanyaan: 'Klarifikasi Bukti Pertanggungjawaban E-Katalog',
      deskripsiKasus: 'Apakah belanja ATK melalui e-katalog di bawah Rp 50 juta wajib dilampirkan bukti fisik SPK?',
      irbanId: pegInspektur.id,
      status: StatusTiket.MENUNGGU_JAWABAN,
    },
  });

  console.log('=== GLOBAL SEEDING SELESAI DENGAN SUKSES ===');
}

main()
  .catch((e) => {
    console.error('Error during global seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
