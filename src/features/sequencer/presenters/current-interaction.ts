import { DEFAULT_INTERVAL_SECONDS } from '../constants/run';
import { dateTime } from '../utils/format';

import type { RunState } from '../types';

export type CurrentInteractionPresentation = {
  eyebrow: string;
  title: string;
  description: string;
  label: string;
  value: string;
  details: [string, string][];
};

export function presentCurrentInteraction(
  run: RunState,
  ready: boolean,
  connected: boolean,
  interval: number,
): CurrentInteractionPresentation {
  if (run.status === 'completed') {
    return {
      eyebrow: 'RUN COMPLETED',
      title: 'Run complete',
      description: 'No more eligible interactions.',
      label: 'RESULT',
      value: `${run.sentCount} emails sent`,
      details: [
        ['RUN STARTED', dateTime(run.runStartedAt)],
        ['FINISHED', dateTime(run.finishedAt)],
      ],
    };
  }

  if (
    run.status === 'running' ||
    run.status === 'error' ||
    run.phase === 'stopped'
  ) {
    const current = run.current;
    const stopped = run.status === 'error' || run.phase === 'stopped';
    const phaseLabels: Record<RunState['phase'], string> = {
      fetching: 'FINDING NEXT INTERACTION',
      sending: 'CURRENTLY SENDING',
      saving: 'SAVING CONFIRMATION',
      waiting: 'LAST PROCESSED INTERACTION',
      stopping: 'STOPPING RUN',
      stopped: 'RUN STOPPED',
      idle: 'RUN IN PROGRESS',
    };
    let eyebrow = phaseLabels[run.phase];
    if (run.status === 'error')
      eyebrow =
        run.errors.at(-1)?.kind === 'uncertain'
          ? 'SEND OUTCOME UNCERTAIN'
          : 'RUN STOPPED';

    return {
      eyebrow,
      title:
        current?.prospect ??
        (stopped ? 'Run stopped' : 'Finding the next email'),
      description:
        current?.email ??
        (run.status === 'error'
          ? 'Resolve the error before another run.'
          : 'Only eligible drafts from the start of this run are included.'),
      label: current ? 'SUBJECT' : 'CURRENT INTERACTION',
      value: current?.subject ?? 'No email selected',
      details: [
        ['PROSPECT', current?.company || '—'],
        ['CREATED AT', dateTime(current?.createdAt ?? null)],
      ],
    };
  }

  if (!ready) {
    return {
      eyebrow: 'ACTION REQUIRED',
      title: connected ? 'Check connections' : 'Connect Gmail',
      description: connected
        ? 'Restore the connection before starting a run.'
        : 'Gmail must be connected before a run can start.',
      label: 'CONNECTION',
      value: connected ? 'See connection status above' : 'Gmail OAuth',
      details: [
        ['REUSES', 'One Gmail account'],
        ['AIRTABLE', 'See connection status above'],
      ],
    };
  }

  return {
    eyebrow: 'Manual run',
    title: 'Ready when you are',
    description: 'Send eligible Airtable drafts one at a time.',
    label: 'Run boundary',
    value: 'Only eligible drafts at run start are included.',
    details: [
      ['Interval', `${interval} seconds`],
      ['Default', `${DEFAULT_INTERVAL_SECONDS / 60} minutes`],
    ],
  };
}
