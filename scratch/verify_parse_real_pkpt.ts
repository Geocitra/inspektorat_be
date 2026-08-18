// scratch/verify_parse_real_pkpt.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PkptGeneratorService } from '../src/audit-planning/services/pkpt-generator.service';
import { PrismaService } from '../src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  console.log('=== MEMULAI SIMULASI AI MEMPELAJARI EXCEL PKPT ANDA ===');

  const app = await NestFactory.createApplicationContext(AppModule);
  const generatorService = app.get(PkptGeneratorService);
  const prisma = app.get(PrismaService);

  const xlsxPath = 'C:/Users/PC/Documents/Dev/inspektorat/docs/references/PKPT 2025 lampiran 14 tahun 2025.xlsx';

  try {
    if (!fs.existsSync(xlsxPath)) {
      throw new Error(`File Excel tidak ditemukan di: ${xlsxPath}`);
    }

    // 1. Ambil data OPD yang ada di database saat ini untuk memastikan referensi fuzzy matching cocok
    const existingOpds = await prisma.mstOpd.findMany();
    console.log(`\n[INFO] Jumlah OPD di database master saat ini: ${existingOpds.length} OPD.`);
    
    // Jika master OPD kosong, kita seed minimal OPD yang ada di Excel Anda untuk uji coba
    if (existingOpds.length === 0) {
      console.log('[INFO] Master OPD kosong, melakukan seeding OPD penting dari Excel Anda...');
      await prisma.mstOpd.createMany({
        data: [
          { namaOpd: 'Dinas Pemadam Kebakaran dan Penyelamatan', alamat: 'Jl. Damkar No. 1', gpsKoordinat: '-7.250445, 112.768845' },
          { namaOpd: 'Dinas Lingkungan Hidup', alamat: 'Jl. Kebersihan No. 2', gpsKoordinat: '-7.260445, 112.778845' },
          { namaOpd: 'DBMSDA', alamat: 'Jl. Bina Marga No. 3', gpsKoordinat: '-7.270445, 112.788845' },
          { namaOpd: 'DISPERKIMTAN', alamat: 'Jl. Perumahan No. 4', gpsKoordinat: '-7.280445, 112.798845' },
          { namaOpd: 'Dinas Pendidikan', alamat: 'Jl. Pendidikan No. 5', gpsKoordinat: '-7.290445, 112.808845' },
          { namaOpd: 'Dinas Kesehatan', alamat: 'Jl. Kesehatan No. 6', gpsKoordinat: '-7.300445, 112.818845' },
          { namaOpd: 'RSUD', alamat: 'Jl. RSUD No. 7', gpsKoordinat: '-7.310445, 112.828845' },
          { namaOpd: 'DISHUB', alamat: 'Jl. Perhubungan No. 8', gpsKoordinat: '-7.320445, 112.838845' },
        ]
      });
      console.log('       Seeding OPD selesai.');
    }

    // 2. Siapkan mock file upload object untuk parser
    const fileBuffer = fs.readFileSync(xlsxPath);
    const mockFile = {
      originalname: path.basename(xlsxPath),
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fileBuffer,
    };

    // 3. Panggil PkptGeneratorService untuk mengurai dan mempelajari Excel tersebut
    console.log('\n[INFO] Memanggil AI Extractor untuk membaca berkas Excel...');
    const result = await generatorService.parseExistingPkpt(2025, mockFile);

    // 4. Verifikasi hasil penyimpanan di database
    const savedPkpt = await prisma.trPkpt.findUnique({
      where: { tahunAnggaran: 2025 },
      include: {
        agendaAudits: {
          include: { opd: true }
        }
      }
    });

    console.log('\n=== HASIL EKSTRAKSI DATABASE ===');
    console.log(`Tahun Anggaran: ${savedPkpt?.tahunAnggaran}`);
    console.log(`Status PKPT: ${savedPkpt?.statusPkpt}`);
    console.log(`Jumlah Agenda Audit yang Berhasil Dipelajari: ${savedPkpt?.agendaAudits.length} item.`);
    
    console.log('\nSampel Agenda Pengawasan yang Berhasil Didigitalisasi:');
    savedPkpt?.agendaAudits.slice(0, 5).forEach((agenda, idx) => {
      const detail = agenda.substansiDokumen as any;
      console.log(`\n${idx + 1}. OPD: ${agenda.opd.namaOpd}`);
      console.log(`   Jenis Pengawasan: ${agenda.jenisPengawasan}`);
      console.log(`   Perkiraan Bulan: Bulan ke-${agenda.perkiraanBulan}`);
      console.log(`   Hari Pengawasan (Tim): PJ=${detail.hariPemeriksaan?.pj}, Dalnis=${detail.hariPemeriksaan?.dalnis}, KT=${detail.hariPemeriksaan?.kt}, AT=${detail.hariPemeriksaan?.at}`);
      console.log(`   Sarana Prasarana: ${detail.saranaPrasarana?.join(', ')}`);
      console.log(`   Alasan Prioritas: ${detail.alasanPrioritas || 'N/A'}`);
    });

    console.log('\n=== SIMULASI SELESAI & SUKSES ===');
  } catch (error: any) {
    console.error('\n[ERROR] Jalannya simulasi gagal:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
