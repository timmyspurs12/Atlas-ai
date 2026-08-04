import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContextMiddleware(
  request: Request & { requestId?: string },
  response: Response,
  next: NextFunction,
): void {
  const inbound = request.header('x-request-id');
  request.requestId = inbound?.slice(0, 100) || randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
}
