// src/prisma/prisma.service.ts
// Mengelola siklus hidup koneksi ke database PostgreSQL.
// @Global() di PrismaModule memastikan service ini tersedia di seluruh aplikasi
// tanpa perlu mengimport ulang.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();

    // Inisialisasi PostgreSQL rules untuk keamanan Append-Only Security Log (ADR-001 / Anti-Fraud)
    try {
      await this.$executeRawUnsafe(
        `CREATE RULE no_update_on_security_ledger AS ON UPDATE TO sec_append_only_log DO INSTEAD NOTHING;`,
      );
    } catch (e) {
      // Rule sudah ada di database, abaikan error
    }

    try {
      await this.$executeRawUnsafe(
        `CREATE RULE no_delete_on_security_ledger AS ON DELETE TO sec_append_only_log DO INSTEAD NOTHING;`,
      );
    } catch (e) {
      // Rule sudah ada di database, abaikan error
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
