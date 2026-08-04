import { z } from 'zod';
import { isoDateSchema, userSummarySchema, uuidSchema } from './common';

export const sendFriendRequestSchema = z
  .object({
    userId: uuidSchema.optional(),
    handle: z.string().trim().min(3).max(30).optional(),
  })
  .refine((value) => Boolean(value.userId || value.handle), {
    message: 'A userId or handle is required',
  });

export const friendshipSchema = z.object({
  id: uuidSchema,
  status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED']),
  direction: z.enum(['INCOMING', 'OUTGOING']),
  friend: userSummarySchema,
  createdAt: isoDateSchema,
});

export const friendshipActionSchema = z.object({
  friendshipId: uuidSchema,
});

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
export type Friendship = z.infer<typeof friendshipSchema>;
