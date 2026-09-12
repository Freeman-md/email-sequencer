'use client';

import { DEFAULT_INTERVAL_SECONDS, initialRunState } from '../constants/run';
import { useDashboardControls } from '../hooks/use-dashboard-controls';
import { useSequencer } from '../hooks/use-sequencer';
import { useServerClock } from '../hooks/use-server-clock';
import { presentCurrentInteraction } from '../presenters/current-interaction';
import { presentRunStatus } from '../presenters/run-status';

import { CurrentInteraction } from './CurrentInteraction';
import { DashboardHeader } from './DashboardHeader';
import { DashboardNotices, RunNotices } from './DashboardNotices';
import { LastSent } from './LastSent';
import { RunStatus } from './RunStatus';

import type { DashboardState } from '../types';

export function Dashboard({
  initial,
  initialError,
  oauthFailed = false,
}: {
  initial: DashboardState | null;
  initialError?: string;
  oauthFailed?: boolean;
}) {
  const { data, error, busy, command, clockSample } = useSequencer(initial);
  const run = data?.run ?? initialRunState();
  const controls = useDashboardControls({ data, run, error, busy, command });
  const now = useServerClock(clockSample, initial?.serverNow);
  const status = presentRunStatus(run, controls.ready, now);
  const current = presentCurrentInteraction(
    run,
    controls.ready,
    Boolean(data?.gmail.connected),
    controls.valid ? controls.seconds : DEFAULT_INTERVAL_SECONDS,
  );
  const displayError = error ?? (!data ? initialError : undefined);
  const panelClass =
    run.status === 'error'
      ? 'panel-error'
      : run.status === 'completed'
        ? 'panel-completed'
        : '';

  return (
    <main className="dashboard">
      <DashboardHeader
        data={data}
        interval={controls.interval}
        intervalDisabled={controls.intervalDisabled}
        valid={controls.valid}
        status={status}
        onIntervalChange={controls.setInterval}
      />
      <DashboardNotices
        data={data}
        displayError={displayError}
        oauthFailed={oauthFailed}
      />
      <div className={`live-panel ${panelClass}`}>
        <CurrentInteraction presentation={current} />
        <RunStatus run={run} presentation={status} controls={controls} />
      </div>
      <LastSent sent={run.lastSent} />
      <RunNotices run={run} />
    </main>
  );
}
