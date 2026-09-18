'use client';

import { useRouter } from 'next/navigation';

import type { Connection, RunState } from '../types';

export function MailboxManagement({
  gmail,
  run,
}: {
  gmail: Connection | undefined;
  run: RunState;
}) {
  const router = useRouter();
  const connected = Boolean(gmail?.connected);
  const connectionLocked = run.status === 'running';
  const detail = gmail?.detail || 'No Gmail connection is available.';
  const actionLabel = connected ? 'Reconnect Gmail' : 'Connect Gmail';

  function beginConnectionChange() {
    if (!connectionLocked) {
      router.push('/api/gmail/connect');
    }
  }

  return (
    <section className="mailbox-management" aria-labelledby="mailboxes-title">
      <div className="mailbox-page-heading">
        <div>
          <h2 id="mailboxes-title">Mailboxes</h2>
          <p>
            One Gmail connection is supported. Reconnecting replaces the
            existing connection.
          </p>
        </div>
        <button
          className="primary mailbox-action"
          type="button"
          disabled={connectionLocked}
          onClick={beginConnectionChange}
        >
          {actionLabel}
        </button>
      </div>

      <section className="mailbox-connection" aria-label="Gmail connection">
        <div>
          <p className="section-label">Gmail connection</p>
          <h3>{connected ? 'Connected' : 'Disconnected'}</h3>
          <p className={connected ? 'success' : 'danger-text'}>{detail}</p>
        </div>
        <div className="connection-status">
          <p className="section-label">Availability</p>
          <p>{connected ? 'Available for a run' : 'Connect Gmail to run'}</p>
        </div>
      </section>

      {connectionLocked && (
        <p className="mailbox-lock-notice" role="status">
          Stop the active run before changing the Gmail connection. The current
          send is allowed to finish safely.
        </p>
      )}
      <p className="mailbox-note">
        Connection changes open Google sign-in and affect this single mailbox
        only. Sending distribution and multiple mailboxes are not available in
        this version.
      </p>
    </section>
  );
}
