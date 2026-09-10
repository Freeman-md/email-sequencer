import 'server-only';
import { initialRunState, MAX_INTERVAL_SECONDS } from '../../constants/run';
import type { Interaction, RunError, RunState } from '../../types';
import type { SendResult } from '@/infrastructure/gmail/send';

export type RunnerDependencies = {
  next: (
    startedAt: string,
    excluded: ReadonlySet<string>,
  ) => Promise<Interaction | null>;
  complete: (id: string, sentAt: string) => Promise<void>;
  send: (interaction: Interaction) => Promise<SendResult>;
  check: () => Promise<void>;
  now?: () => Date;
};

export function createRunner(deps: RunnerDependencies) {
  let state = initialRunState();
  let active = false;
  let stopRequested = false;
  let wake: (() => void) | undefined;
  const now = deps.now ?? (() => new Date());
  const summary = (interaction: Interaction) => ({
    id: interaction.id,
    prospect: interaction.prospect,
    company: interaction.company,
    email: interaction.email,
    subject: interaction.subject,
    createdAt: interaction.createdAt,
  });
  const addError = (error: RunError) => {
    state.errors = [...state.errors.slice(-19), error];
  };
  const halt = (error: RunError) => {
    addError(error);
    state.status = 'error';
  };

  async function execute(runStartedAt: string) {
    const excluded = new Set<string>();
    try {
      await deps.check();
      while (!stopRequested) {
        state.phase = 'fetching';
        state.current = null;
        const interaction = await deps.next(runStartedAt, excluded);
        if (stopRequested) break;
        if (!interaction) {
          state.status = 'completed';
          break;
        }
        state.current = summary(interaction);
        if (
          excluded.has(interaction.id) ||
          Date.parse(interaction.createdAt) > Date.parse(runStartedAt) ||
          !Number.isFinite(Date.parse(interaction.createdAt))
        ) {
          halt({
            kind: 'system',
            message:
              'An ineligible or already processed Interaction was returned. Run stopped.',
            interactionId: interaction.id,
          });
          break;
        }
        excluded.add(interaction.id);
        state.phase = 'sending';
        let result: SendResult;
        try {
          result = await deps.send(interaction);
        } catch {
          result = {
            kind: 'uncertain',
            message:
              'Sending ended without a confirmed outcome. Check Gmail manually.',
          };
        }
        if (result.kind === 'uncertain') {
          halt({ ...result, interactionId: interaction.id });
          break;
        }
        if (result.kind === 'definite') {
          state.failureCount++;
          addError({ ...result, interactionId: interaction.id });
        } else {
          state.sentCount++;
          state.lastSent = { ...summary(interaction), sentAt: result.sentAt };
          state.phase = stopRequested ? 'stopping' : 'saving';
          try {
            await deps.complete(interaction.id, result.sentAt);
          } catch {
            halt({
              kind: 'reconciliation',
              interactionId: interaction.id,
              message: `Gmail confirmed this send at ${result.sentAt}, but Airtable did not confirm the update. Set this Interaction to Completed with that Sent At before another run. Do not resend it.`,
            });
            break;
          }
        }
        if (stopRequested) break;
        state.phase = 'waiting';
        state.nextSendAt = new Date(
          now().getTime() + state.intervalSeconds * 1000,
        ).toISOString();
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wake = undefined;
            resolve();
          }, state.intervalSeconds * 1000);
          wake = () => {
            clearTimeout(timer);
            wake = undefined;
            resolve();
          };
        });
        state.nextSendAt = null;
      }
    } catch (error) {
      halt({
        kind: 'system',
        message:
          error instanceof Error
            ? error.message
            : 'Run stopped because a service is unavailable.',
      });
    } finally {
      if (stopRequested && state.status !== 'error') state.status = 'idle';
      state.phase = state.status === 'completed' ? 'idle' : 'stopped';
      state.nextSendAt = null;
      state.finishedAt = now().toISOString();
      active = false;
      wake = undefined;
    }
  }

  return {
    snapshot: (): RunState => structuredClone(state),
    isActive: () => active,
    start(intervalSeconds: number) {
      if (active) throw new Error('A run is already active.');
      if (
        !Number.isInteger(intervalSeconds) ||
        intervalSeconds < 1 ||
        intervalSeconds > MAX_INTERVAL_SECONDS
      ) {
        throw new Error(
          `Interval Seconds must be a whole number from 1 to ${MAX_INTERVAL_SECONDS}.`,
        );
      }
      // Acquire synchronously before any I/O so competing HTTP requests cannot both start.
      active = true;
      stopRequested = false;
      const runStartedAt = now().toISOString();
      state = {
        ...initialRunState(),
        lastSent: state.lastSent,
        intervalSeconds,
        runStartedAt,
        status: 'running',
        phase: 'fetching',
      };
      void execute(runStartedAt);
      return this.snapshot();
    },
    stop() {
      if (active) {
        stopRequested = true;
        state.phase = 'stopping';
        wake?.();
      }
      return this.snapshot();
    },
  };
}
