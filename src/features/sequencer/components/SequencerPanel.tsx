'use client';

import { useState } from 'react';

import { DEFAULT_INTERVAL_SECONDS, initialRunState } from '../constants/run';
import { useDashboardControls } from '../hooks/use-dashboard-controls';
import { useSequencer } from '../hooks/use-sequencer';
import { useServerClock } from '../hooks/use-server-clock';
import { presentCurrentInteraction } from '../presenters/current-interaction';
import { presentRunStatus } from '../presenters/run-status';

import { DashboardHeader } from './DashboardHeader';
import { Overview } from './Overview';

import type { DashboardState } from '../types';
import type { ReactNode } from 'react';

export function SequencerPanel({
  children,
  initial,
  initialError,
  oauthFailed = false,
  oauthFailureDetail,
  renderMailboxes,
}: {
  children?: ReactNode;
  initial: DashboardState | null;
  initialError?: string;
  oauthFailed?: boolean;
  oauthFailureDetail?: string;
  renderMailboxes: (active: boolean) => ReactNode;
}) {
  const [activeView, setActiveView] = useState<'overview' | 'mailboxes'>(
    'overview',
  );
  const { data, error, busy, command, clockSample, reconcile } =
    useSequencer(initial);
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

  return (
    <main className="dashboard">
      <DashboardHeader
        data={data}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      <div hidden={activeView !== 'overview'}>
        <Overview
          data={data}
          displayError={displayError}
          oauthFailed={oauthFailed}
          oauthFailureDetail={oauthFailureDetail}
          run={run}
          current={current}
          status={status}
          controls={controls}
          busy={busy}
          onReconcile={reconcile}
        >
          {children}
        </Overview>
      </div>
      <div hidden={activeView !== 'mailboxes'}>
        {renderMailboxes(run.status === 'running')}
      </div>
    </main>
  );
}
