import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { requestId?: string }>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = isHttp ? exception.getResponse() : null;

    let message = 'An unexpected error occurred';
    let code = 'INTERNAL_ERROR';
    let details: Record<string, unknown> | undefined;

    if (typeof raw === 'string') {
      message = raw;
      code = this.toCode(message);
    } else if (raw && typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      const rawMessage = record.message;
      message = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : typeof rawMessage === 'string'
          ? rawMessage
          : message;
      code = typeof record.code === 'string' ? record.code : this.toCode(message);
      if (record.details && typeof record.details === 'object') {
        details = record.details as Record<string, unknown>;
      }
    }

    if (!isHttp || status >= 500) {
      const trace = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${request.method} ${request.originalUrl} failed`, trace);
    }

    const payload: ErrorPayload = {
      statusCode: status,
      code,
      message: status >= 500 ? 'An unexpected error occurred' : message,
      requestId: request.requestId,
      ...(details ? { details } : {}),
    };
    response.status(status).json(payload);
  }

  private toCode(message: string): string {
    return (
      message
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .toUpperCase()
        .slice(0, 80) || 'REQUEST_FAILED'
    );
  }
}
