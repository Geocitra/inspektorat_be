// src/common/pipes/zod-validation.pipe.ts
// Pipe validasi menggunakan Zod sebagai pengganti class-validator.
// Keunggulan: Type-safe, schema reusable di FE & BE, error message yang kaya.
// Cara pakai: @Body(new ZodValidationPipe(MySchema)) dto: MyDto

import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validasi Input Gagal',
        errors: result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }
    return result.data;
  }
}
