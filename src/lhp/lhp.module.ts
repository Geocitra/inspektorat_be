// src/lhp/lhp.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LhpService } from './lhp.service';
import { LhpController } from './lhp.controller';
import { LhpProcessor } from './lhp.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'lhp_generation',
    }),
  ],
  controllers: [LhpController],
  providers: [LhpService, LhpProcessor],
  exports: [LhpService],
})
export class LhpModule {}
