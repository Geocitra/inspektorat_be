// src/common/ai/ai.module.ts
import { Module, Global } from '@nestjs/common';
import { AiService } from './ai.service';
import { VendorLlmAdapter } from './vendor-llm.adapter';

@Global()
@Module({
  providers: [AiService, VendorLlmAdapter],
  exports: [AiService, VendorLlmAdapter],
})
export class AiModule {}
