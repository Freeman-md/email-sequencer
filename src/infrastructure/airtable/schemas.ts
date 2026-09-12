import { z } from 'zod';

export const recordSchema = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
});
export const recordsSchema = z.object({
  records: z.array(recordSchema),
  offset: z.string().min(1).optional(),
});
export type AirtableRecord = z.infer<typeof recordSchema>;
