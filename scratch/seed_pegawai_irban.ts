// scratch/seed_pegawai_irban.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Menyelaraskan Master Pegawai & Unit Kerja Irban...');

  // Cari OPD Inspektorat
  let inspektorat = await prisma.mstOpd.findFirst({
    where: {
      OR: [
        { namaOpd: { contains: 'Inspektorat', mode: 'insensitive' } },
        { namaOpd: { contains: 'ITDA', mode: 'insensitive' } }
      ]
    }
  });

  if (!inspektorat) {
    inspektorat = await prisma.mstOpd.findFirst();
  }

  if (!inspektorat) {
    console.error('Tidak ada OPD ditemukan di database.');
    return;
  }

  const opdId = inspektorat.id;

  // 1. Update Pegawai Eksisting
  // Hartono (Inspektur) -> SEKRETARIAT, bukan lapangan
  await prisma.mstPegawai.updateMany({
    where: { nip: '19700101-01' },
    data: {
      unitKerja: 'SEKRETARIAT',
      isAuditorLapangan: false,
      jabatan: 'Inspektur Daerah',
    }
  });

  // Ahmad (Kasubag) -> SEKRETARIAT, bukan lapangan
  await prisma.mstPegawai.updateMany({
    where: { nip: '19850101-01' },
    data: {
      unitKerja: 'SEKRETARIAT',
      isAuditorLapangan: false,
      jabatan: 'Kasubag Perencanaan & Penugasan',
    }
  });

  // 2. Daftar Pegawai Lapangan Per Unit Irban
  const staffData = [
    // --- IRBAN 1 ---
    {
      nip: '19780101-11',
      nama: 'Bambang Supriyadi, M.Si (Irban 1)',
      golongan: 'Pembina / IV-a',
      jabatan: 'Inspektur Pembantu Wilayah I',
      unitKerja: 'IRBAN_1' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19900101-01',
      nama: 'Auditor Senior 1 (Budi Santoso, S.E., Ak.)',
      golongan: 'Penata Tk I / III-d',
      jabatan: 'Auditor Ahli Muda',
      unitKerja: 'IRBAN_1' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19950101-11',
      nama: 'Auditor Pertama 1 (Rini Astuti, S.Ak)',
      golongan: 'Penata Muda / III-a',
      jabatan: 'Auditor Ahli Pertama',
      unitKerja: 'IRBAN_1' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19880101-11',
      nama: 'PPUPD Muda 1 (Dedi Kurniawan, S.Sos)',
      golongan: 'Penata / III-c',
      jabatan: 'PPUPD Ahli Muda',
      unitKerja: 'IRBAN_1' as const,
      isAuditorLapangan: true,
    },

    // --- IRBAN 2 ---
    {
      nip: '19790101-22',
      nama: 'Drs. Hendra Gunawan (Irban 2)',
      golongan: 'Pembina / IV-a',
      jabatan: 'Inspektur Pembantu Wilayah II',
      unitKerja: 'IRBAN_2' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19900101-02',
      nama: 'Auditor Senior 2 (Agus Pratama, S.T.)',
      golongan: 'Penata Tk I / III-d',
      jabatan: 'Auditor Ahli Muda (Fisik & PBJ)',
      unitKerja: 'IRBAN_2' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19950101-22',
      nama: 'Auditor Pertama 2 (Dewi Lestari, S.T.)',
      golongan: 'Penata Muda / III-a',
      jabatan: 'Auditor Ahli Pertama',
      unitKerja: 'IRBAN_2' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19870101-22',
      nama: 'PPUPD Madya 2 (Ir. Suryanto)',
      golongan: 'Pembina / IV-a',
      jabatan: 'PPUPD Ahli Madya',
      unitKerja: 'IRBAN_2' as const,
      isAuditorLapangan: true,
    },

    // --- IRBAN 3 ---
    {
      nip: '19800101-33',
      nama: 'Siti Aminah, M.Ak (Irban 3)',
      golongan: 'Pembina / IV-a',
      jabatan: 'Inspektur Pembantu Wilayah III',
      unitKerja: 'IRBAN_3' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19900101-03',
      nama: 'Auditor Senior 3 (Faisal Anwar, S.E.)',
      golongan: 'Penata Tk I / III-d',
      jabatan: 'Auditor Ahli Muda (Keuangan)',
      unitKerja: 'IRBAN_3' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19960101-33',
      nama: 'Auditor Pertama 3 (Nadia Putri, S.E.)',
      golongan: 'Penata Muda / III-a',
      jabatan: 'Auditor Ahli Pertama',
      unitKerja: 'IRBAN_3' as const,
      isAuditorLapangan: true,
    },

    // --- IRBAN INVESTIGASI ---
    {
      nip: '19770101-44',
      nama: 'Kol. Mar. Firman Siregar (Irban Investigasi)',
      golongan: 'Pembina Tk I / IV-b',
      jabatan: 'Inspektur Pembantu Investigasi',
      unitKerja: 'IRBAN_INVESTIGASI' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19900101-04',
      nama: 'Auditor Senior 4 (Eko Prasetyo, CFrA)',
      golongan: 'Pembina / IV-a',
      jabatan: 'Auditor Ahli Madya (Forensik)',
      unitKerja: 'IRBAN_INVESTIGASI' as const,
      isAuditorLapangan: true,
    },
    {
      nip: '19940101-44',
      nama: 'Auditor Investigasi 1 (Yusuf Habibie, S.H.)',
      golongan: 'Penata / III-c',
      jabatan: 'Auditor Ahli Pertama (Hukum)',
      unitKerja: 'IRBAN_INVESTIGASI' as const,
      isAuditorLapangan: true,
    }
  ];

  for (const staff of staffData) {
    await prisma.mstPegawai.upsert({
      where: { nip: staff.nip },
      update: {
        nama: staff.nama,
        golongan: staff.golongan,
        jabatan: staff.jabatan,
        unitKerja: staff.unitKerja,
        isAuditorLapangan: staff.isAuditorLapangan,
        opdId: opdId,
      },
      create: {
        nip: staff.nip,
        nama: staff.nama,
        golongan: staff.golongan,
        jabatan: staff.jabatan,
        unitKerja: staff.unitKerja,
        isAuditorLapangan: staff.isAuditorLapangan,
        opdId: opdId,
        sumberData: 'MANUAL',
      }
    });
  }

  console.log('✅ Berhasil menyelaraskan seluruh pegawai fungsional per Unit Irban!');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
