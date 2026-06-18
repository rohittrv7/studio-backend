import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { sanitizeForLog } from '../utils/sanitize-log.util';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res['message'] as string | string[]) ?? exception.message;
        error = (res['error'] as string) ?? exception.name;
      } else {
        message = exception.message;
        error = exception.name;
      }

      // Sanitise the message to ensure no PII leaks through validation messages, etc.
      const safeMessage = Array.isArray(message) ? message.join(', ') : message;
      this.logger.warn(
        `HTTP ${statusCode} — ${request.method} ${request.url}: ${safeMessage}`,
      );
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';

      // Log the real error internally but never include stack traces in the response.
      // Sanitise request body/headers before logging to prevent PII in logs.
      const errorName =
        exception instanceof Error ? exception.constructor.name : 'UnknownError';

      const sanitizedHeaders = sanitizeForLog(request.headers) as Record<string, unknown>;
      const sanitizedBody = sanitizeForLog(request.body) as Record<string, unknown>;

      this.logger.error(
        `Unhandled exception [${errorName}] — ${request.method} ${request.url} ` +
          `headers=${JSON.stringify(sanitizedHeaders)} body=${JSON.stringify(sanitizedBody)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // The response body never includes stack traces, internal details, or PII.
    const body: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }
}
