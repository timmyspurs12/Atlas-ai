import { z } from 'zod';
import { uuidSchema } from './common';

export const assistantQuestionSchema = z.object({
  question: z.string().trim().min(2).max(500),
  conversationId: uuidSchema.optional(),
  preciseLocationConsent: z.boolean().default(false),
});

export const assistantActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('OPEN_PERSON'), userId: uuidSchema }),
  z.object({ type: z.literal('OPEN_TRIP'), tripId: uuidSchema }),
  z.object({ type: z.literal('OPEN_REPORT'), period: z.enum(['WEEK', 'MONTH']) }),
  z.object({ type: z.literal('NONE') }),
]);

export const assistantResponseSchema = z.object({
  conversationId: uuidSchema,
  answer: z.string(),
  action: assistantActionSchema,
  generatedBy: z.enum(['DETERMINISTIC', 'AI']),
  dataAsOf: z.iso.datetime({ offset: true }).nullable(),
  safetyNotice: z.string().nullable(),
});

export type AssistantQuestion = z.infer<typeof assistantQuestionSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
