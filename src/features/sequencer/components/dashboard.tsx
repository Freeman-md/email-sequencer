'use client';
import { useState } from 'react';
import type { DashboardState } from '../types';
import { initialRunState, MAX_INTERVAL_SECONDS } from '../constants/run';
import { useSequencer } from '../hooks/use-sequencer';
import { CurrentInteraction } from './current-interaction';
import { LastSent } from './last-sent';
import { dateTime, countdown } from './format';

export function Dashboard({
  initial,
  initialError,
  oauthFailed = false,
}: {
  initial: DashboardState | null;
  initialError?: string;
  oauthFailed?: boolean;
}) {
  const { data, error, busy, command, now } = useSequencer(initial);
  const [interval, setInterval] = useState(
    String(initial?.run.intervalSeconds ?? 300),
  );
  const [reviewed, setReviewed] = useState(false);
  const run = data?.run ?? initialRunState();
  const active = run.status === 'running';
  const waiting = run.phase === 'waiting';
  const stopping = run.phase === 'stopping';
  const stopped = run.status === 'error';
  const ready = Boolean(data?.airtable.connected && data?.gmail.connected);
  const seconds = active ? run.intervalSeconds : Number(interval);
  const valid =
    Number.isInteger(seconds) &&
    seconds >= 1 &&
    seconds <= MAX_INTERVAL_SECONDS;
  const remaining = countdown(run.nextSendAt, now);
  const manualCheck = run.errors.some(
    (entry) => entry.kind === 'uncertain' || entry.kind === 'reconciliation',
  );
  const status = stopped
    ? 'Run stopped'
    : stopping
      ? 'Stopping run'
      : active
        ? waiting
          ? `Next send in ${remaining}`
          : run.phase === 'saving'
            ? 'Saving confirmation'
            : run.phase === 'fetching'
              ? 'Finding next email'
              : 'Sending email'
        : run.status === 'completed'
          ? 'Completed'
          : run.phase === 'stopped'
            ? 'Stopped'
            : ready
              ? 'Ready'
              : 'Idle';
  const subtitle = stopped
    ? run.errors.at(-1)?.message
    : stopping
      ? 'Finishing any in-flight send and saving its outcome.'
      : active
        ? waiting
          ? 'The next Interaction is fetched after the interval.'
          : run.phase === 'sending'
            ? 'Awaiting Gmail confirmation…'
            : run.phase === 'saving'
              ? 'Updating Airtable after confirmed Gmail success.'
              : 'Checking eligible drafts, oldest first.'
        : run.status === 'completed'
          ? 'All eligible drafts have been processed.'
          : run.phase === 'stopped'
            ? 'Stopped by you. Start a new run when ready.'
            : ready
              ? 'Airtable and Gmail are connected.'
              : 'Connect Gmail to enable Start Run.';
  const stateNumber = stopped
    ? '06'
    : run.status === 'completed'
      ? '05'
      : waiting
        ? '04'
        : active
          ? '03'
          : ready
            ? '02'
            : '01';
  const stateLabel = stopped
    ? 'Error / run stopped'
    : run.status === 'completed'
      ? 'Run completed'
      : waiting
        ? 'Waiting between emails'
        : active
          ? 'Run in progress'
          : ready
            ? 'Connected / ready'
            : 'Gmail disconnected / idle';
  const displayError = error ?? (!data ? initialError : undefined);
  return (
    <main className="dashboard">
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
              value={active ? run.intervalSeconds : interval}
              onChange={(event) => setInterval(event.target.value)}
              disabled={active || busy}
              aria-invalid={!valid}
            />
          </div>
          <div className="connection state">
            <span className="eyebrow">STATE {stateNumber}</span>
            <strong>{stateLabel}</strong>
          </div>
        </div>
      </header>
      {displayError && (
        <div className="notice danger" role="alert">
          {displayError} The server may still be processing an active run.
        </div>
      )}
      {oauthFailed && (
        <div className="notice danger" role="alert">
          Gmail connection failed or was cancelled. Check Google OAuth settings,
          grant send permission and verify token file permissions, then connect
          again.
        </div>
      )}
      {data && !data.airtable.connected && (
        <div className="notice danger" role="alert">
          {data.airtable.detail}
        </div>
      )}
      <div
        className={`live-panel ${stopped ? 'panel-error' : run.status === 'completed' ? 'panel-completed' : ''}`}
      >
        <CurrentInteraction
          run={run}
          ready={ready}
          connected={Boolean(data?.gmail.connected)}
          interval={seconds || 300}
        />
        <section className="run-status" aria-label="Run status">
          <p className="eyebrow">RUN STATUS</p>
          <h2
            className={`status-title ${stopped ? 'danger-text' : active ? 'status-active' : ready || run.status === 'completed' ? 'success' : 'muted'}`}
            aria-live="polite"
          >
            <i className="dot" />
            {status}
          </h2>
          <p className="status-description">{subtitle}</p>
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
              <dd>
                {stopped || stopping
                  ? 'Stopped'
                  : waiting
                    ? `${remaining} · interval ${run.intervalSeconds}s`
                    : active
                      ? 'After send confirmation'
                      : '—'}
              </dd>
            </div>
          </dl>
          {manualCheck && (
            <label className="manual-check">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              I checked Gmail and reconciled the Interaction in Airtable.
            </label>
          )}
          {active ? (
            <button
              className="primary stop"
              disabled={busy || stopping}
              onClick={() => void command('stop')}
            >
              {stopping ? 'Stopping…' : 'Stop Run'}
            </button>
          ) : !data?.gmail.connected ? (
            <a className="primary" href="/api/gmail/connect">
              Connect Gmail
            </a>
          ) : (
            <button
              className="primary"
              disabled={
                !ready ||
                !valid ||
                busy ||
                Boolean(error) ||
                (manualCheck && !reviewed)
              }
              onClick={() => {
                setReviewed(false);
                void command('start', seconds);
              }}
            >
              {busy
                ? 'Starting…'
                : run.runStartedAt
                  ? 'Start New Run'
                  : 'Start Run'}
            </button>
          )}
          {!valid && (
            <p className="danger-text input-error">
              Enter a whole number from 1 to {MAX_INTERVAL_SECONDS} seconds.
            </p>
          )}
        </section>
      </div>
      <LastSent sent={run.lastSent} />
      {run.errors.length > 0 ? (
        <div
          className={`notice ${stopped ? 'danger' : 'warning'}`}
          role="alert"
        >
          {run.failureCount > 0 && (
            <p>
              {run.failureCount} send{run.failureCount === 1 ? '' : 's'} failed
              · Draft unchanged{active ? ' · Run continuing' : ''}
            </p>
          )}
          {run.errors.map((entry, index) => (
            <p key={`${entry.interactionId}-${index}`}>
              {entry.interactionId && (
                <strong>Interaction {entry.interactionId}: </strong>
              )}
              {entry.message}
            </p>
          ))}
        </div>
      ) : (
        <p className="footnote">
          {run.status === 'completed'
            ? 'Run ended because Airtable returned no more eligible interactions.'
            : 'Only interactions that existed at run start are included in this run.'}
        </p>
      )}
    </main>
  );
}
