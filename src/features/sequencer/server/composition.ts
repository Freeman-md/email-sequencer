import 'server-only';

import { getInfrastructure } from '@/infrastructure';

import { InteractionsRepository } from './repositories/interactions.repository';
import { ProspectsRepository } from './repositories/prospects.repository';
import { SequencerRuntime } from './runtime/sequencer-runtime';
import { ConnectionsService } from './services/connections.service';
import { SequencerService } from './services/sequencer.service';

function composeServices() {
  const { airtable, gmail } = getInfrastructure();
  const runtime = new SequencerRuntime();
  const interactions = new InteractionsRepository(airtable);
  const prospects = new ProspectsRepository(airtable);
  const connections = new ConnectionsService(
    interactions,
    prospects,
    gmail,
    runtime,
  );
  const sequencer = new SequencerService(
    interactions,
    prospects,
    gmail,
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
  processState.emailSequencerServices ??= composeServices();

  return processState.emailSequencerServices;
}
