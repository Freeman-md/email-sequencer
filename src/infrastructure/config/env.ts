import 'server-only';

import { configSchema } from './schemas';

import type { Config } from './schemas';

export function getConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    // Never include submitted values or upstream error objects in public errors.
    throw new Error(
      `Configuration required: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  }

  return result.data;
}

export function appOrigin() {
  return new URL(getConfig().EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI).origin;
}
