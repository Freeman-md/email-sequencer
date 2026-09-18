import type { DashboardState, RunState } from '../types';

export function DashboardNotices({
  data,
  displayError,
  oauthFailed,
  oauthFailureDetail,
}: {
  data: DashboardState | null;
  displayError?: string | null;
  oauthFailed: boolean;
  oauthFailureDetail?: string;
}) {
  return (
    <>
      {displayError && (
        <div className="notice danger" role="alert">
          {displayError} The server may still be processing an active run.
        </div>
      )}
      {oauthFailed && (
        <div className="notice danger" role="alert">
          Gmail connection failed or was cancelled. Check Google OAuth settings,
          grant send/metadata permissions and offline access, and verify private
          file permissions, then connect again.
        </div>
      )}
      {oauthFailureDetail && (
        <div className="notice danger" role="alert">
          {oauthFailureDetail}
        </div>
      )}
      {data && !data.airtable.connected && (
        <div className="notice danger" role="alert">
          {data.airtable.detail}
        </div>
      )}
    </>
  );
}

export function RunNotices({ run }: { run: RunState }) {
  const stopped = run.status === 'error';
  const active = run.status === 'running';

  return (
    <>
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
    </>
  );
}
