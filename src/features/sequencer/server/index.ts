import 'server-only';
import { getConfig } from '@/infrastructure/config/env';
import { finishOAuth } from '@/infrastructure/gmail/oauth';
import { createGmailSender } from '@/infrastructure/gmail/send';
import { createInteractionRepository } from './repositories/interactions';
import { createRunner } from './services/runner';
import { checkConnections } from './services/connections';
import type { DashboardState } from '../types';

const processState = globalThis as typeof globalThis & {
  gmailConnectionChanging?: boolean;
  sequencerRunner?: ReturnType<typeof createRunner>;
  sequencerConnections?: {
    expires: number;
    value: ReturnType<typeof checkConnections>;
  };
};

export function getRunner() {
  getConfig();
  if (!processState.sequencerRunner) {
    const repository = createInteractionRepository();
    processState.sequencerRunner = createRunner({
      ...repository,
      send: createGmailSender(),
      async check() {
        const connections = await checkConnections();
        processState.sequencerConnections = {
          expires: Date.now() + 60_000,
          value: Promise.resolve(connections),
        };
        if (!connections.airtable.connected)
          throw new Error(connections.airtable.detail);
        if (!connections.gmail.connected)
          throw new Error(connections.gmail.detail);
      },
    });
  }
  return processState.sequencerRunner;
}

export function invalidateConnections() {
  processState.sequencerConnections = undefined;
}

export async function getDashboardState(): Promise<DashboardState> {
  const runner = getRunner();
  if (
    !processState.sequencerConnections ||
    processState.sequencerConnections.expires < Date.now()
  ) {
    processState.sequencerConnections = {
      expires: Date.now() + 60_000,
      value: checkConnections(),
    };
  }
  const connections = await processState.sequencerConnections.value;
  return {
    ...connections,
    run: runner.snapshot(),
    serverNow: new Date().toISOString(),
  };
}

export function startRun(intervalSeconds: number) {
  if (processState.gmailConnectionChanging)
    throw new Error(
      'Gmail connection is being updated. Wait for it to finish.',
    );
  return getRunner().start(intervalSeconds);
}

export async function connectGmail(
  state: string,
  cookie: string | undefined,
  code: string,
) {
  if (getRunner().isActive() || processState.gmailConnectionChanging)
    throw new Error('Stop the run before changing Gmail.');
  processState.gmailConnectionChanging = true;
  try {
    await finishOAuth(state, cookie, code);
    invalidateConnections();
  } finally {
    processState.gmailConnectionChanging = false;
  }
}
