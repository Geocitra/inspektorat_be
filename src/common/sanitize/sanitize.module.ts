// src/common/sanitize/sanitize.module.ts
import { Module, Global } from '@nestjs/common';
import { SanitizeService } from './sanitize.service';

@Global()
@Module({
  providers: [SanitizeService],
  exports: [SanitizeService],
})
export class SanitizeModule {}
