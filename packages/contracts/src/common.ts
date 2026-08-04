import { z } from 'zod';

export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.datetime({ offset: true });

export const paginationSchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

export const userSummarySchema = z.object({
  id: uuidSchema,
  displayName: z.string().min(1),
  handle: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  lastSeenAt: isoDateSchema.nullable(),
  isOnline: z.boolean(),
});

export type UserSummary = z.infer<typeof userSummarySchema>;
