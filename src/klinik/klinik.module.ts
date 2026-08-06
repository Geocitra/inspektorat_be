// src/klinik/klinik.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { KlinikService } from './klinik.service';
import { KlinikController } from './klinik.controller';
import { KlinikProcessor } from './klinik.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'regulasi_embedding',
    }),
  ],
  controllers: [KlinikController],
  providers: [KlinikService, KlinikProcessor],
  exports: [KlinikService],
})
export class KlinikModule {}
