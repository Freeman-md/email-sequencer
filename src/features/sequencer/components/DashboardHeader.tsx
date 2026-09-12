import { MAX_INTERVAL_SECONDS } from '../constants/run';

import type { RunStatusPresentation } from '../presenters/run-status';
import type { DashboardState } from '../types';

export function DashboardHeader({
  data,
  interval,
  intervalDisabled,
  valid,
  status,
  onIntervalChange,
}: {
  data: DashboardState | null;
  interval: string;
  intervalDisabled: boolean;
  valid: boolean;
  status: RunStatusPresentation;
  onIntervalChange: (value: string) => void;
}) {
  return (
    <header className="header">
      <div className="heading">
        <h1>Email Sequencer — V1</h1>
        <p className="desktop-description">
          Send eligible Airtable drafts through one connected Gmail account.
        </p>
        <p className="mobile-description">Internal sending tool</p>
      </div>
      <div className="connections">
        <div className="connection">
          <span className="eyebrow">AIRTABLE</span>
          <span
            className={`connection-state ${data?.airtable.connected ? 'success' : 'muted'}`}
          >
            <i className="dot" />
            <span className="connection-text">
              {data?.airtable.connected ? 'Connected' : 'Unavailable'}
            </span>
          </span>
        </div>
        <div className="connection gmail">
          <span className="eyebrow">GMAIL</span>
          <span
            className={`connection-state ${data?.gmail.connected ? 'success' : 'muted'}`}
          >
            <i className="dot" />
            <span className="connection-text">
              {data?.gmail.connected ? 'Connected' : 'Disconnected'}
            </span>
          </span>
          <small>{data?.gmail.detail ?? 'Connect once via OAuth'}</small>
        </div>
        <div className="connection interval">
          <label className="eyebrow" htmlFor="interval">
            <span className="desktop-label">INTERVAL SECONDS</span>
            <span className="mobile-label">INTERVAL</span>
          </label>
          <input
            id="interval"
            aria-label="INTERVAL SECONDS"
            type="number"
            min="1"
            max={MAX_INTERVAL_SECONDS}
            step="1"
            value={interval}
            onChange={(event) => onIntervalChange(event.target.value)}
            disabled={intervalDisabled}
            aria-invalid={!valid}
          />
        </div>
        <div className="connection state">
          <span className="eyebrow">STATE {status.stateNumber}</span>
          <strong>{status.stateLabel}</strong>
        </div>
      </div>
    </header>
  );
}
