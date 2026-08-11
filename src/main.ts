// src/main.ts
// Entry point aplikasi NestJS.
// Melakukan bootstrapping: mendaftarkan global filter, mengaktifkan CORS,
// dan menjalankan HTTP server pada port yang ditentukan.

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Tampilkan log level yang relevan saat development
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // 1. Pasang Global Exception Filter
  //    Menangkap SEMUA error dan mengubahnya menjadi format JSON yang konsisten
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // 2. Aktifkan CORS agar Frontend Next.js bisa berkomunikasi
  app.enableCors({
    origin: ['http://localhost:3001', 'http://localhost:5173'], // Port FE dev server
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-mock-role',
      'x-mock-user-id',
      'x-mock-pegawai-id',
    ],
  });

  // 3. Jalankan aplikasi di port dari konfigurasi .env
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);

  await app.listen(port);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          APIP Suite Backend — AKTIF                  ║');
  console.log(`║  URL    : http://localhost:${port}                       ║`);
  console.log(`║  Env    : ${configService.get('nodeEnv')}                               ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Endpoints Fase 1 tersedia:');
  console.log(`  → GET/POST     http://localhost:${port}/api/v1/opd`);
  console.log(`  → GET/PUT/DEL  http://localhost:${port}/api/v1/opd/:id`);
  console.log(`  → GET/POST     http://localhost:${port}/api/v1/pegawai`);
  console.log(`  → POST         http://localhost:${port}/api/v1/pegawai/sync`);
  console.log(`  → GET/PUT/DEL  http://localhost:${port}/api/v1/pegawai/:id`);
  console.log('');
}

bootstrap();
