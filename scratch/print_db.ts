// scratch/print_db.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- USERS ---');
  const users = await prisma.user.findMany({
    include: { pegawai: true, opd: true }
  });
  console.log(JSON.stringify(users, null, 2));

  console.log('--- PEGAWAI ---');
  const pegawais = await prisma.mstPegawai.findMany({
    include: { opd: true }
  });
  console.log(JSON.stringify(pegawais, null, 2));

  console.log('--- OPD ---');
  const opds = await prisma.mstOpd.findMany();
  console.log(JSON.stringify(opds, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
