'use client';

import { useMailboxes } from '../hooks/use-mailboxes';

import type { MailboxState } from '../types/mailbox';

function connectionLabel(mailbox: MailboxState): string {
  if (mailbox.connected) {
    return 'Connected';
  }
  if (mailbox.hasCredentials === null) {
    return 'Connection error';
  }

  return mailbox.hasCredentials ? 'Unavailable' : 'Disconnected';
}

export function MailboxManagement({
  active,
  authorizationError,
}: {
  active: boolean;
  authorizationError?: string;
}) {
  const { state, error, busyId, disconnect } = useMailboxes();
  const locked = active || busyId !== null;

  return (
    <section className="mailbox-management" aria-labelledby="mailboxes-title">
      <div className="mailbox-page-heading">
        <div>
          <h2 id="mailboxes-title">Mailboxes</h2>
          <p>
            New conversations rotate automatically across available Gmail
            accounts. Follow-ups stay with their original sender.
          </p>
        </div>
        {locked ? (
          <button className="primary mailbox-action" type="button" disabled>
            Add Mailbox
          </button>
        ) : (
          <a className="primary mailbox-action" href="/api/gmail/connect">
            Add Mailbox
          </a>
        )}
      </div>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {state?.migrationNotice && (
        <p className="notice warning">{state.migrationNotice}</p>
      )}
      {authorizationError && (
        <p className="notice danger" role="alert">
          {authorizationError}
        </p>
      )}
      {!state && !error && <p role="status">Checking mailboxes…</p>}
      {state && state.mailboxes.length === 0 && (
        <p>No mailboxes connected yet. Add a Gmail account to start sending.</p>
      )}
      {state?.mailboxes.map((mailbox) => (
        <section
          className="mailbox-connection"
          key={mailbox.id}
          aria-label={mailbox.email || mailbox.id}
        >
          <div>
            <p className="section-label">Gmail mailbox</p>
            <h3>{mailbox.email || mailbox.id}</h3>
            <p className={mailbox.connected ? 'success' : 'danger-text'}>
              {connectionLabel(mailbox)}
            </p>
            <p>{mailbox.detail}</p>
          </div>
          <div className="connection-status mailbox-actions">
            {locked ? (
              <button className="secondary" type="button" disabled>
                Reconnect Gmail
              </button>
            ) : (
              <a
                className="secondary"
                href={`/api/gmail/connect?mailboxId=${encodeURIComponent(mailbox.id)}`}
              >
                Reconnect Gmail
              </a>
            )}
            <button
              className="secondary"
              type="button"
              disabled={locked || mailbox.hasCredentials === false}
              onClick={() => void disconnect(mailbox.id)}
            >
              {busyId === mailbox.id ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </section>
      ))}
      {active && (
        <p className="mailbox-lock-notice" role="status">
          Stop the active run before changing the Gmail connection. The current
          send is allowed to finish safely.
        </p>
      )}
      <p className="mailbox-note">
        Disconnect removes local credentials only. It does not revoke Google
        consent or remove mailbox records and sent-interaction history.
      </p>
    </section>
  );
}
