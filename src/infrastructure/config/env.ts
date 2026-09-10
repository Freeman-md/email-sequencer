import 'server-only';
import { z } from 'zod';

const schema = z.object({
  AIRTABLE_API_TOKEN: z.string().min(1),
  AIRTABLE_BASE_ID: z.string().regex(/^app[a-zA-Z0-9]{14}$/),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.pathname === '/api/gmail/callback' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname)))
    );
  }, 'Use https://your-host/api/gmail/callback (HTTP is allowed only on localhost).'),
  GMAIL_TOKEN_FILE: z.string().min(1),
  APP_PASSWORD: z.string().min(16),
});

export type Config = z.infer<typeof schema>;

export function getConfig(): Config {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Never include submitted values or upstream error objects in public errors.
    throw new Error(
      `Configuration required: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  }
  return result.data;
}

export function appOrigin() {
  return new URL(getConfig().GOOGLE_REDIRECT_URI).origin;
}
