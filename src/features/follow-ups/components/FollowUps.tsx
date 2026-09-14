'use client';
import { useFollowUps } from '../hooks/use-follow-ups';

export function FollowUps() {
  const {
    state,
    error,
    busy,
    loaded,
    active,
    limit,
    setLimit,
    validLimit,
    prepare,
    stop,
  } = useFollowUps();

  return (
    <section className="follow-ups" aria-labelledby="follow-ups-title">
      <div className="follow-ups-heading">
        <div>
          <h2 id="follow-ups-title">Follow-Ups</h2>
          <p>
            Prepare due follow-ups as drafts in Airtable. Review them there,
            then start the sequencer to send.
          </p>
        </div>
        <div className="follow-ups-controls">
          <label htmlFor="follow-up-limit">
            Draft limit <span className="muted">(optional)</span>
          </label>
          <input
            id="follow-up-limit"
            type="number"
            min="1"
            step="1"
            placeholder="No limit"
            value={active ? (state.limit ?? '') : limit}
            onChange={(event) => setLimit(event.target.value)}
            disabled={!loaded || busy || active}
            aria-invalid={!validLimit}
            aria-describedby="follow-up-limit-help"
          />
          <small
            id="follow-up-limit-help"
            className={!validLimit ? 'danger-text' : 'muted'}
          >
            {!validLimit
              ? 'Enter a positive whole number.'
              : 'Blank means all due prospects. Skips do not count.'}
          </small>
          {active ? (
            <button
              className="primary stop"
              disabled={busy || state.status === 'stopping'}
              onClick={() => void stop()}
            >
              {state.status === 'stopping' ? 'Stopping…' : 'Stop Preparation'}
            </button>
          ) : (
            <button
              className="primary"
              disabled={!loaded || busy || !validLimit}
              onClick={() => void prepare()}
            >
              {busy ? 'Starting…' : 'Prepare Follow-Ups'}
            </button>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite">
        {state.status !== 'idle' && (
          <p>
            {state.status === 'running'
              ? 'Preparing'
              : state.status === 'stopping'
                ? 'Stopping preparation'
                : state.status === 'stopped'
                  ? 'Preparation stopped'
                  : state.status === 'error'
                    ? 'Preparation stopped'
                    : 'Preparation complete'}{' '}
            · Checked: {state.checked} · Eligible: {state.eligible} · Drafted:{' '}
            {state.drafted}
            {state.limit !== null ? ` / ${state.limit}` : ''} · Skipped:{' '}
            {state.skipped}
            {state.status === 'completed' &&
            state.limit !== null &&
            state.drafted >= state.limit
              ? ' · Draft limit reached'
              : ''}
          </p>
        )}
      </div>
      {state.status === 'stopping' && (
        <p className="muted">
          Waiting for the current request to settle. Any draft save already
          started will finish.
        </p>
      )}
      {(error || state.error) && (
        <p role="alert" className="danger-text">
          {error || state.error}
        </p>
      )}
      {Object.keys(state.reasons).length > 0 && (
        <details>
          <summary>
            Skip reasons
            {state.errorCount > 0 ? ` · ${state.errorCount} errors` : ''}
          </summary>
          <ul>
            {Object.entries(state.reasons).map(([reason, count]) => (
              <li key={reason}>
                {reason}: {count}
              </li>
            ))}
          </ul>
          {state.errors.length > 0 && (
            <>
              <p>
                Most recent errors ({state.errors.length} of {state.errorCount}
                ):
              </p>
              <ul>
                {state.errors.map((item, index) => (
                  <li key={`${item.prospectId}-${index}`}>
                    {item.prospectId}: {item.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
    </section>
  );
}
