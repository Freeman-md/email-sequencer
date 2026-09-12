import 'server-only';

import { OAuth2Client } from 'google-auth-library';

import { AirtableClient } from './airtable/client';
import { getConfig } from './config/env';
import { GmailClient } from './gmail/client';
import { GmailService } from './gmail/service';
import { FileTokenStore } from './gmail/token-store';
import { OpenAIClient } from './openai/client';

function composeInfrastructure() {
  const config = getConfig();
  const airtable = new AirtableClient(config);
  const gmailClient = new GmailClient(
    config.EMAIL_SEQUENCER_GOOGLE_CLIENT_ID,
    () =>
      new OAuth2Client({
        clientId: config.EMAIL_SEQUENCER_GOOGLE_CLIENT_ID,
        clientSecret: config.EMAIL_SEQUENCER_GOOGLE_CLIENT_SECRET,
        redirectUri: config.EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI,
        transporterOptions: { timeout: 20_000, retry: false },
      }),
  );
  const gmail = new GmailService(
    gmailClient,
    new FileTokenStore(config.GMAIL_TOKEN_FILE),
  );

  const textGenerator = new OpenAIClient({
    apiKey: config.EMAIL_SEQUENCER_OPENAI_API_KEY ?? '',
    model: config.EMAIL_SEQUENCER_OPENAI_MODEL ?? '',
  });

  return { airtable, gmail, textGenerator };
}

// Preserve pending OAuth callbacks across development module reloads.
const processState = globalThis as typeof globalThis & {
  emailSequencerInfrastructure?: ReturnType<typeof composeInfrastructure>;
};

export function getInfrastructure() {
  processState.emailSequencerInfrastructure ??= composeInfrastructure();

  return processState.emailSequencerInfrastructure;
}
