// src/audit-planning/audit-planning.module.ts
import { Module } from '@nestjs/common';
import { AuditPlanningService } from './audit-planning.service';
import { AuditPlanningController } from './audit-planning.controller';

@Module({
  controllers: [AuditPlanningController],
  providers: [AuditPlanningService],
  exports: [AuditPlanningService],
})
export class AuditPlanningModule {}
