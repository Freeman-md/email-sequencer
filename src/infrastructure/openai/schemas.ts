import { z } from 'zod';

export const responseSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  incomplete_details: z.object({ reason: z.string() }).nullish(),
  usage: z
    .object({
      input_tokens: z.number().nonnegative(),
      output_tokens: z.number().nonnegative(),
      total_tokens: z.number().nonnegative(),
    })
    .nullish(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    }),
  ),
});

export const errorSchema = z.object({
  error: z.object({ code: z.string().nullish() }),
});
