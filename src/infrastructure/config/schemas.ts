import { z } from 'zod';

export const configSchema = z.object({
  EMAIL_SEQUENCER_OPENAI_API_KEY: z.string().optional(),
  EMAIL_SEQUENCER_OPENAI_MODEL: z.string().optional(),
  AIRTABLE_API_TOKEN: z.string().min(1),
  AIRTABLE_BASE_ID: z.string().regex(/^app[a-zA-Z0-9]{14}$/),
  EMAIL_SEQUENCER_GOOGLE_CLIENT_ID: z.string().min(1),
  EMAIL_SEQUENCER_GOOGLE_CLIENT_SECRET: z.string().min(1),
  EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI: z.url().refine((value) => {
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

export type Config = z.infer<typeof configSchema>;
