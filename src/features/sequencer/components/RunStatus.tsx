import { MAX_INTERVAL_SECONDS } from '../constants/run';

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
    <section className="run-controls" aria-label="Run controls">
      <div className="run-controls-heading">
        <h2
          className={appearanceClasses[presentation.appearance]}
          aria-live="polite"
        >
          <i className="dot" />
          {presentation.title}
        </h2>
        <p>{presentation.subtitle}</p>
      </div>
      <dl className="run-facts">
        <div>
          <dt>Sent this run</dt>
          <dd>{run.sentCount}</dd>
        </div>
        <div>
          <dt>Current timing</dt>
          <dd>{presentation.nextSend}</dd>
        </div>
      </dl>
      {controls.needsReview && (
        <label className="reconciliation-check">
          <input
            type="checkbox"
            checked={controls.reviewed}
            onChange={(event) => controls.setReviewed(event.target.checked)}
          />
          I checked Gmail and reconciled the Interaction in Airtable.
        </label>
      )}
      <div className="run-action-row">
        <label htmlFor="interval" className="interval-field">
          <span>Interval Seconds</span>
          <input
            id="interval"
            aria-label="INTERVAL SECONDS"
            type="number"
            min="1"
            max={MAX_INTERVAL_SECONDS}
            step="1"
            value={controls.interval}
            onChange={(event) => controls.setInterval(event.target.value)}
            disabled={controls.intervalDisabled}
            aria-invalid={!controls.valid}
          />
        </label>
        {controls.action === 'connect' ? (
          <a className="primary" href="/api/gmail/connect">
            Connect Gmail
          </a>
        ) : (
          <button
            className={controls.action === 'stop' ? 'primary stop' : 'primary'}
            disabled={
              controls.action === 'stop'
                ? !controls.canStop
                : !controls.canStart
            }
            onClick={
              controls.action === 'stop' ? controls.stop : controls.start
            }
          >
            {controls.actionLabel}
          </button>
        )}
      </div>
      {!controls.valid && (
        <p className="danger-text input-error" role="alert">
          Enter a whole number from 1 to {MAX_INTERVAL_SECONDS} seconds.
        </p>
      )}
    </section>
  );
}
