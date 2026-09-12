import 'server-only';

import { airtableRequest } from '@/infrastructure/airtable/client';
import { getConfig } from '@/infrastructure/config/env';
import { finishOAuth, gmailConnection } from '@/infrastructure/gmail/oauth';
import { createGmailSender } from '@/infrastructure/gmail/send';

import { InteractionsRepository } from './repositories/interactions.repository';
import { ProspectsRepository } from './repositories/prospects.repository';
import { SequencerRuntime } from './runtime/sequencer-runtime';
import { ConnectionsService } from './services/connections.service';
import { SequencerService } from './services/sequencer.service';

function composeServices() {
  const runtime = new SequencerRuntime();
  const interactions = new InteractionsRepository(airtableRequest);
  const prospects = new ProspectsRepository(airtableRequest);
  const connections = new ConnectionsService(
    interactions,
    prospects,
    { check: gmailConnection, authorize: finishOAuth },
    runtime,
  );
  const sequencer = new SequencerService(
    interactions,
    prospects,
    { send: createGmailSender() },
    connections,
    runtime,
  );

  return { sequencer, connections };
}

// Keep the process-wide run lock across development module reloads.
const processState = globalThis as typeof globalThis & {
  emailSequencerServices?: ReturnType<typeof composeServices>;
};

export function getSequencerServices() {
  getConfig();
  processState.emailSequencerServices ??= composeServices();

  return processState.emailSequencerServices;
}
