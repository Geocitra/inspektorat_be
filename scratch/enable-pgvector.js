const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Attempting to create vector extension in PostgreSQL...');
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('Extension pgvector enabled successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
