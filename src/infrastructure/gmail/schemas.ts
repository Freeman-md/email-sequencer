import { z } from 'zod';

export const tokenSchema = z.object({
  refreshToken: z.string().min(1),
  email: z.email(),
});
export type StoredToken = z.infer<typeof tokenSchema>;

const reasonSchema = z.object({ reason: z.string().optional() });

export const errorSchema = z.object({
  error: z.object({
    errors: z.array(reasonSchema).optional(),
    details: z.array(reasonSchema).optional(),
  }),
});

export const sentMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
});

export const threadSchema = z.object({
  id: z.string().min(1),
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        threadId: z.string().min(1),
        internalDate: z.string().regex(/^\d+$/),
        labelIds: z.array(z.string()).default([]),
        payload: z.object({
          headers: z.array(z.object({ name: z.string(), value: z.string() })),
        }),
      }),
    )
    .min(1),
});
export type GmailThread = z.infer<typeof threadSchema>;
