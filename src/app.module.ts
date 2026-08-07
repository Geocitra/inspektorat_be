// src/app.module.ts
// Root Module — titik masuk utama aplikasi.
// Mendaftarkan semua modul global: Config, Throttler (Rate Limiter), Prisma,
// dan semua modul bisnis (OPD, Pegawai, dst).

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';

import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { OpdModule } from './opd/opd.module';
import { PegawaiModule } from './pegawai/pegawai.module';
import { AuditPlanningModule } from './audit-planning/audit-planning.module';
import { AssignmentModule } from './assignment/assignment.module';
import { KkaModule } from './kka/kka.module';
import { LhpModule } from './lhp/lhp.module';
import { TlhpModule } from './tlhp/tlhp.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { WbsModule } from './wbs/wbs.module';
import { SanitizeModule } from './common/sanitize/sanitize.module';
import { AiModule } from './common/ai/ai.module';
import { KlinikModule } from './klinik/klinik.module';
import { DocumentIngestionModule } from './document-ingestion/document-ingestion.module';

@Module({
  imports: [
    // 1. Konfigurasi Global (membaca .env dan menyediakan ConfigService)
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // 2. Rate Limiting Terpusat berbasis Redis
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'integration_api',
            limit: 10,    // Maksimal 10 request
            ttl: 60000,   // Per 60 detik (dalam milliseconds)
          },
        ],
        storage: new ThrottlerStorageRedisService(
          new Redis({
            host: config.get<string>('redis.host', '127.0.0.1'),
            port: config.get<number>('redis.port', 6379),
          }),
        ),
      }),
    }),

    // 3. Antrean Asinkron Terpusat (BullMQ) berbasis Redis
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host', '127.0.0.1'),
          port: config.get<number>('redis.port', 6379),
        },
      }),
    }),

    // 4. Modul Database (Global — tersedia tanpa import ulang)
    PrismaModule,

    // 5. Global Helper Modules
    CryptoModule,
    SanitizeModule,
    AiModule,

    // 6. Modul Bisnis
    OpdModule,
    PegawaiModule,
    AuditPlanningModule,
    AssignmentModule,
    KkaModule,
    LhpModule,
    TlhpModule,
    WbsModule,
    KlinikModule,
    DocumentIngestionModule,
  ],
})
export class AppModule {}
