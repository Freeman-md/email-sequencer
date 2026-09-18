import 'server-only';

import { resolve } from 'node:path';

import { OAuth2Client } from 'google-auth-library';

import { AirtableClient } from './airtable/client';
import { getConfig } from './config/env';
import { GmailAuthorization } from './gmail/authorization';
import { GmailClient } from './gmail/client';
import { MailboxGmailService } from './gmail/mailbox-service';
import { MailboxTokenStore } from './gmail/mailbox-token-store';
import { OpenAIClient } from './openai/client';
import { FileSendAttemptStore } from './send-attempts/store';

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
  // Private runtime storage is not a build-time resource to bundle.
  const legacyPath = resolve(
    /* turbopackIgnore: true */ config.GMAIL_TOKEN_FILE,
  );
  const credentialPath = `${legacyPath}.v2`;
  const attemptPath = resolve(
    /* turbopackIgnore: true */ config.SEND_ATTEMPT_FILE ??
      `${legacyPath}.attempts`,
  );
  if ([legacyPath, credentialPath].includes(attemptPath)) {
    throw new Error(
      'SEND_ATTEMPT_FILE must be separate from Gmail credential storage.',
    );
  }
  const mailboxTokens = new MailboxTokenStore(credentialPath, legacyPath);
  const gmail = new MailboxGmailService(gmailClient, mailboxTokens);
  const authorization = new GmailAuthorization(gmailClient);
  const attempts = new FileSendAttemptStore(attemptPath);

  const textGenerator = new OpenAIClient({
    apiKey: config.EMAIL_SEQUENCER_OPENAI_API_KEY ?? '',
    model: config.EMAIL_SEQUENCER_OPENAI_MODEL ?? '',
  });

  return {
    airtable,
    gmail,
    gmailClient,
    mailboxTokens,
    authorization,
    attempts,
    textGenerator,
  };
}

// Preserve pending OAuth callbacks across development module reloads.
const processState = globalThis as typeof globalThis & {
  emailSequencerInfrastructure?: ReturnType<typeof composeInfrastructure>;
};

export function getInfrastructure() {
  processState.emailSequencerInfrastructure ??= composeInfrastructure();

  return processState.emailSequencerInfrastructure;
}
