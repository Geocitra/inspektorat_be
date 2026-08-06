// src/opd/opd.module.ts
import { Module } from '@nestjs/common';
import { OpdService } from './opd.service';
import { OpdController } from './opd.controller';

@Module({
  controllers: [OpdController],
  providers: [OpdService],
  exports: [OpdService], // Ekspor agar bisa digunakan oleh modul lain (PegawaiModule, dll)
})
export class OpdModule {}
