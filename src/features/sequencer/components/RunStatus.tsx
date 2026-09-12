import { MAX_INTERVAL_SECONDS } from '../constants/run';
import { dateTime } from '../utils/format';

import type { useDashboardControls } from '../hooks/use-dashboard-controls';
import type { RunStatusPresentation } from '../presenters/run-status';
import type { RunState } from '../types';

const appearanceClasses = {
  error: 'danger-text',
  active: 'status-active',
  success: 'success',
  muted: 'muted',
};

export function RunStatus({
  run,
  presentation,
  controls,
}: {
  run: RunState;
  presentation: RunStatusPresentation;
  controls: ReturnType<typeof useDashboardControls>;
}) {
  return (
    <section className="run-status" aria-label="Run status">
      <p className="eyebrow">RUN STATUS</p>
      <h2
        className={`status-title ${appearanceClasses[presentation.appearance]}`}
        aria-live="polite"
      >
        <i className="dot" />
        {presentation.title}
      </h2>
      <p className="status-description">{presentation.subtitle}</p>
      <dl className="stats">
        <div>
          <dt>Run started at</dt>
          <dd>{dateTime(run.runStartedAt)}</dd>
        </div>
        <div>
          <dt>Emails sent</dt>
          <dd>
            <strong>{run.sentCount}</strong>
          </dd>
        </div>
        <div>
          <dt>Next send</dt>
          <dd>{presentation.nextSend}</dd>
        </div>
      </dl>
      {controls.needsReview && (
        <label className="manual-check">
          <input
            type="checkbox"
            checked={controls.reviewed}
            onChange={(event) => controls.setReviewed(event.target.checked)}
          />
          I checked Gmail and reconciled the Interaction in Airtable.
        </label>
      )}
      {controls.action === 'connect' ? (
        <a className="primary" href="/api/gmail/connect">
          Connect Gmail
        </a>
      ) : (
        <button
          className={controls.action === 'stop' ? 'primary stop' : 'primary'}
          disabled={
            controls.action === 'stop' ? !controls.canStop : !controls.canStart
          }
          onClick={controls.action === 'stop' ? controls.stop : controls.start}
        >
          {controls.actionLabel}
        </button>
      )}
      {!controls.valid && (
        <p className="danger-text input-error">
          Enter a whole number from 1 to {MAX_INTERVAL_SECONDS} seconds.
        </p>
      )}
    </section>
  );
}
