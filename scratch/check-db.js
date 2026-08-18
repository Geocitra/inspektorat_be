const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const documents = await prisma.auditDocument.findMany({ select: { id: true, title: true, type: true } });
  console.log('DOCUMENTS IN DATABASE:', documents);

  const pkpts = await prisma.trPkpt.findMany({ select: { id: true, tahunAnggaran: true, statusPkpt: true } });
  console.log('PKPTS IN DATABASE:', pkpts);

  const sts = await prisma.trSuratTugas.findMany({ select: { id: true, nomorSt: true, statusSt: true } });
  console.log('SURAT TUGAS IN DATABASE:', sts);

  const opds = await prisma.mstOpd.findMany({ select: { id: true, namaOpd: true } });
  console.log('OPDS IN DATABASE:', opds.length);

  const pegawais = await prisma.mstPegawai.findMany({ select: { id: true, nama: true } });
  console.log('PEGAWAIS IN DATABASE:', pegawais.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
