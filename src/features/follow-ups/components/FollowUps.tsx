'use client';
import { useFollowUps } from '../hooks/use-follow-ups';

export function FollowUps() {
  const { state, error, busy, prepare } = useFollowUps();

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
        <button
          className="primary"
          disabled={busy}
          onClick={() => void prepare()}
        >
          {busy ? 'Preparing…' : 'Prepare Follow-Ups'}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {state.status !== 'idle' && (
          <p>
            {state.status === 'running'
              ? 'Preparing'
              : state.status === 'error'
                ? 'Preparation stopped'
                : 'Preparation complete'}{' '}
            · Checked: {state.checked} · Eligible: {state.eligible} · Drafted:{' '}
            {state.drafted} · Skipped: {state.skipped}
          </p>
        )}
      </div>
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
