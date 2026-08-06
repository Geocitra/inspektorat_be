// src/tlhp/tlhp.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TlhpService } from './tlhp.service';
import { TlhpController } from './tlhp.controller';
import { TlhpProcessor } from './tlhp.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'compliance_calculation',
    }),
  ],
  controllers: [TlhpController],
  providers: [TlhpService, TlhpProcessor],
  exports: [TlhpService],
})
export class TlhpModule {}
