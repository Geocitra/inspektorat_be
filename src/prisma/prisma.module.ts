// src/prisma/prisma.module.ts
// @Global() memastikan PrismaService dapat diinjeksi di seluruh module
// tanpa perlu mengimport PrismaModule berkali-kali.

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
