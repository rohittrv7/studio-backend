import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Header lookup is case-insensitive in Express (headers are lowercased)
    const existingId = req.headers[REQUEST_ID_HEADER] as string | undefined;
    const requestId = existingId?.trim() || randomUUID();

    // Echo the value back so clients can correlate requests
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}
