import { CurrentInteraction } from './CurrentInteraction';
import { DashboardNotices, RunNotices } from './DashboardNotices';
import { LastSent } from './LastSent';
import { RunStatus } from './RunStatus';
import { SendReconciliation } from './SendReconciliation';

import type { useDashboardControls } from '../hooks/use-dashboard-controls';
import type { CurrentInteractionPresentation } from '../presenters/current-interaction';
import type { RunStatusPresentation } from '../presenters/run-status';
import type { DashboardState, RunState } from '../types';
import type { ReactNode } from 'react';

export function Overview({
  children,
  data,
  displayError,
  oauthFailed,
  oauthFailureDetail,
  run,
  current,
  status,
  controls,
  busy,
  onReconcile,
}: {
  children?: ReactNode;
  data: DashboardState | null;
  displayError?: string;
  oauthFailed: boolean;
  oauthFailureDetail?: string;
  run: RunState;
  current: CurrentInteractionPresentation;
  status: RunStatusPresentation;
  controls: ReturnType<typeof useDashboardControls>;
  busy: boolean;
  onReconcile: (
    attemptId: string,
    outcome: 'sent' | 'not-sent',
  ) => Promise<void>;
}) {
  const panelState =
    run.status === 'error'
      ? 'panel-error'
      : run.status === 'completed'
        ? 'panel-completed'
        : '';

  return (
    <section className="overview" aria-labelledby="overview-title">
      <h2 className="visually-hidden" id="overview-title">
        Overview
      </h2>
      <DashboardNotices
        data={data}
        displayError={displayError}
        oauthFailed={oauthFailed}
        oauthFailureDetail={oauthFailureDetail}
      />
      <p className="footnote">
        Automatic distribution: new conversations rotate across available
        mailboxes. Follow-ups always use their original sender.
      </p>
      {data?.pendingAttempt && run.status !== 'running' && (
        <SendReconciliation
          key={data.pendingAttempt.id}
          attempt={data.pendingAttempt}
          disabled={busy}
          onReconcile={onReconcile}
        />
      )}
      <div className={`operational-surface ${panelState}`}>
        <CurrentInteraction presentation={current} />
        <RunStatus run={run} presentation={status} controls={controls} />
      </div>
      <RunNotices run={run} />
      <LastSent sent={run.lastSent} />
      <section
        className="follow-up-disclosure"
        aria-label="Follow-up preparation"
      >
        <details>
          <summary>Prepare follow-up drafts</summary>
          <p>
            Create eligible follow-up drafts for review in Airtable before a
            sending run.
          </p>
          {children}
        </details>
      </section>
    </section>
  );
}
