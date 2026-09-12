import { countdown } from '../utils/format';

import type { RunState } from '../types';

export type RunStatusPresentation = {
  title: string;
  subtitle: string;
  stateNumber: string;
  stateLabel: string;
  appearance: 'error' | 'active' | 'success' | 'muted';
  nextSend: string;
};

export function presentRunStatus(
  run: RunState,
  ready: boolean,
  now: number,
): RunStatusPresentation {
  if (run.status === 'error') {
    return {
      title: 'Run stopped',
      subtitle:
        run.errors.at(-1)?.message ?? 'Resolve the error before another run.',
      stateNumber: '06',
      stateLabel: 'Error / run stopped',
      appearance: 'error',
      nextSend: 'Stopped',
    };
  }

  if (run.status === 'running') {
    const remaining = countdown(run.nextSendAt, now);
    const phases = {
      fetching: [
        'Finding next email',
        'Checking eligible drafts, oldest first.',
      ],
      sending: ['Sending email', 'Awaiting Gmail confirmation…'],
      saving: [
        'Saving confirmation',
        'Updating Airtable after confirmed Gmail success.',
      ],
      waiting: [
        `Next send in ${remaining}`,
        'The next Interaction is fetched after the interval.',
      ],
      stopping: [
        'Stopping run',
        'Finishing any in-flight send and saving its outcome.',
      ],
      idle: ['Run in progress', 'Checking the current run state.'],
      stopped: ['Stopping run', 'Finishing the current run.'],
    } satisfies Record<RunState['phase'], [string, string]>;
    const [title, subtitle] = phases[run.phase];
    let nextSend = 'After send confirmation';
    if (run.phase === 'waiting')
      nextSend = `${remaining} · interval ${run.intervalSeconds}s`;
    if (run.phase === 'stopping') nextSend = 'Stopped';

    return {
      title,
      subtitle,
      nextSend,
      appearance: 'active',
      stateNumber: run.phase === 'waiting' ? '04' : '03',
      stateLabel:
        run.phase === 'waiting' ? 'Waiting between emails' : 'Run in progress',
    };
  }

  if (run.status === 'completed') {
    return {
      title: 'Completed',
      subtitle: 'All eligible drafts have been processed.',
      stateNumber: '05',
      stateLabel: 'Run completed',
      appearance: 'success',
      nextSend: '—',
    };
  }

  return {
    title: run.phase === 'stopped' ? 'Stopped' : ready ? 'Ready' : 'Idle',
    subtitle:
      run.phase === 'stopped'
        ? 'Stopped by you. Start a new run when ready.'
        : ready
          ? 'Airtable and Gmail are connected.'
          : 'Check the connections above before starting a run.',
    stateNumber: ready ? '02' : '01',
    stateLabel: ready ? 'Connected / ready' : 'Connections unavailable / idle',
    appearance: ready ? 'success' : 'muted',
    nextSend: '—',
  };
}
