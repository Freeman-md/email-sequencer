import { describe, expect, it } from 'vitest';

import { initialRunState } from '@/features/sequencer/constants/run';
import { presentCurrentInteraction } from '@/features/sequencer/presenters/current-interaction';
import { presentRunStatus } from '@/features/sequencer/presenters/run-status';

import type { RunState } from '@/features/sequencer/types';

describe('run presentation', () => {
  it.each([
    ['fetching', 'FINDING NEXT INTERACTION', 'Finding next email'],
    ['sending', 'CURRENTLY SENDING', 'Sending email'],
    ['saving', 'SAVING CONFIRMATION', 'Saving confirmation'],
    ['waiting', 'LAST PROCESSED INTERACTION', 'Next send in 00:10'],
    ['stopping', 'STOPPING RUN', 'Stopping run'],
  ] as const)('distinguishes %s from sending', (phase, eyebrow, title) => {
    const run: RunState = {
      ...initialRunState(),
      status: 'running',
      phase,
      nextSendAt: '2026-09-09T12:00:10Z',
    };

    expect(presentCurrentInteraction(run, true, true, 300).eyebrow).toBe(
      eyebrow,
    );
    expect(
      presentRunStatus(run, true, Date.parse('2026-09-09T12:00:00Z')).title,
    ).toBe(title);
  });
});
