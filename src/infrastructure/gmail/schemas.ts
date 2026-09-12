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

export const sentMessageSchema = z.object({ id: z.string().min(1) });
