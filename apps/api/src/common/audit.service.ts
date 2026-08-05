import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditSeverity, type Prisma } from '../generated/prisma/client';

export interface AuditEvent {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  severity?: AuditSeverity;
  outcome?: 'SUCCESS' | 'DENIED' | 'FAILURE';
  metadata?: Record<string, unknown>;
  requestId?: string;
  ipHash?: string;
  userAgent?: string;
}

const REDACTED_KEYS = new Set([
  'password',
  'token',
  'latitude',
  'longitude',
  'body',
  'ciphertext',
  'secret',
]);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      const metadata = event.metadata
        ? Object.fromEntries(
            Object.entries(event.metadata).filter(([key]) => !REDACTED_KEYS.has(key.toLowerCase())),
          )
        : undefined;
      await this.prisma.auditLog.create({
        data: {
          actorId: event.actorId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          severity: event.severity ?? AuditSeverity.INFO,
          outcome: event.outcome ?? 'SUCCESS',
          metadata: metadata as Prisma.InputJsonValue | undefined,
          requestId: event.requestId,
          ipHash: event.ipHash,
          userAgent: event.userAgent,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit event ${event.action}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
