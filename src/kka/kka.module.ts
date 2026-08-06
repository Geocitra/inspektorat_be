// src/kka/kka.module.ts
import { Module } from '@nestjs/common';
import { KkaService } from './kka.service';
import { KkaController } from './kka.controller';

@Module({
  controllers: [KkaController],
  providers: [KkaService],
  exports: [KkaService],
})
export class KkaModule {}
