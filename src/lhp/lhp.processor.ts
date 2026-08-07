// src/lhp/lhp.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Processor('lhp_generation')
export class LhpProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { stId, nomorLhp, ringkasanEksekutif } = job.data;
    console.log(
      `[QUEUED JOB] Memulai penyusunan dokumen LHP untuk ST ID: ${stId}, Nomor LHP: ${nomorLhp}`,
    );

    // 1. Ambil seluruh KKA berstatus APPROVED beserta rincian anomali barang pengadaan PBJ hasil evaluasi AI (Fase 4)
    const kkas = await this.prisma.trKka.findMany({
      where: {
        stId: stId,
        statusKka: 'APPROVED',
      },
      include: {
        itemAudits: {
          where: {
            status: 'ANOMALI',
          },
        },
      },
    });

    console.log(`[QUEUED JOB] Menemukan ${kkas.length} KKA dengan status APPROVED.`);

    // 2. Buat folder storage/lhp di workspace jika belum ada
    const storageDir = path.join(process.cwd(), 'storage', 'lhp');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // 3. Gabungkan ringkasan eksekutif dan seluruh temuan dari KKA ke berkas teks/mock PDF
    const filename = `lhp-${stId}.txt`;
    const filePath = path.join(storageDir, filename);

    let docContent = '';
    docContent += `========================================================\n`;
    docContent += `LAPORAN HASIL PEMERIKSAAN (LHP) - INSPEKTORAT DAERAH\n`;
    docContent += `========================================================\n`;
    docContent += `Nomor LHP           : ${nomorLhp}\n`;
    docContent += `Surat Tugas ID      : ${stId}\n`;
    docContent += `Tanggal Dibuat      : ${new Date().toISOString()}\n`;
    docContent += `--------------------------------------------------------\n\n`;
    docContent += `RINGKASAN EKSEKUTIF:\n`;
    docContent += `${ringkasanEksekutif}\n\n`;
    docContent += `--------------------------------------------------------\n`;
    docContent += `KERTAS KERJA AUDIT GABUNGAN & ANOMALI PBJ (APPROVED):\n`;

    kkas.forEach((kka, index) => {
      docContent += `\nKKA #${index + 1} (ID: ${kka.id})\n`;
      docContent += `- Prosedur  : ${kka.prosedurPemeriksaan}\n`;
      docContent += `- Pengujian : ${kka.uraianPengujian}\n`;
      docContent += `- Kesimpulan: ${kka.kesimpulanSementara}\n`;

      // Jika ada anomali barang pengadaan hasil analisis semantik AI (Fase 4), rajut ke dalam dokumen fisik
      if (kka.itemAudits && kka.itemAudits.length > 0) {
        docContent += `\n  [TERDETEKSI ANOMALI PENGADAAN PBJ - AI COPILOT]:\n`;
        kka.itemAudits.forEach((item, itemIdx) => {
          docContent += `  ${itemIdx + 1}. Nama Barang Realisasi : ${item.itemName}\n`;
          docContent += `     - Spesifikasi Direncanakan : ${item.specRequired || '-'}\n`;
          docContent += `     - Spesifikasi Fisik Nyata  : ${item.specActual || '-'}\n`;
          docContent += `     - Harga Satuan Rencana     : Rp ${Number(item.priceContract || 0).toLocaleString('id-ID')}\n`;
          docContent += `     - Harga Satuan Realisasi   : Rp ${Number(item.priceActual || 0).toLocaleString('id-ID')}\n`;
          docContent += `     - Volume Rencana           : ${Number(item.volumeContract || 0)}\n`;
          docContent += `     - Volume Realisasi         : ${Number(item.volumeActual || 0)}\n`;
          docContent += `     - Deviasi Harga Total      : Rp ${Number(item.selisihHarga || 0).toLocaleString('id-ID')}\n`;
          docContent += `     - Analisis Temuan AI       : ${item.analisisCopilot || '-'}\n`;
        });
      }
      docContent += `--------------------------------------------------------\n`;
    });

    fs.writeFileSync(filePath, docContent, 'utf-8');
    console.log(`[QUEUED JOB] Dokumen LHP berhasil disusun di: ${filePath}`);

    // Return path relatif untuk disimpan ke DB
    const relativePath = path.join('storage', 'lhp', filename).replace(/\\/g, '/');
    return { success: true, filePath: relativePath };
  }
}