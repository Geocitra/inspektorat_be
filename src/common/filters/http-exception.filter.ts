// src/common/filters/http-exception.filter.ts
// Global Exception Filter — menangkap SEMUA error dan mengubahnya menjadi
// format JSON yang konsisten dan ramah developer.
// Didaftarkan secara global di main.ts menggunakan app.useGlobalFilters().

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      exception instanceof Error ? exception.message : 'Internal Server Error';

    // Log error ke console untuk debugging di development
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error('[APIP ERROR]', exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: (exceptionResponse as any)?.message || message,
      errors: (exceptionResponse as any)?.errors || null,
    });
  }
}
