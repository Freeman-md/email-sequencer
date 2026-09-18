'use client';

import { useState } from 'react';

import type { SendAttempt } from '@/infrastructure/send-attempts/store';

export function SendReconciliation({
  attempt,
  disabled,
  onReconcile,
}: {
  attempt: SendAttempt;
  disabled: boolean;
  onReconcile: (
    attemptId: string,
    outcome: 'sent' | 'not-sent',
  ) => Promise<void>;
}) {
  const [verified, setVerified] = useState(false);
  const [outcome, setOutcome] = useState<'sent' | 'not-sent'>('sent');

  return (
    <section
      className="notice danger send-reconciliation"
      aria-label="Send reconciliation"
    >
      <h3>Unresolved send — sending is blocked</h3>
      <p>
        Interaction {attempt.interactionId} · {attempt.mailboxEmail} (
        {attempt.mailboxId}) · Attempt {attempt.id}
      </p>
      <p>
        Inspect Sent mail in this mailbox. Do not resend or assume an unknown
        outcome means failure.
      </p>
      {attempt.confirmation && (
        <p>
          Gmail confirmed {attempt.confirmation.sentAt}. Message ID:{' '}
          {attempt.confirmation.gmailMessageId}. Thread ID:{' '}
          {attempt.confirmation.gmailThreadId}.
        </p>
      )}
      <p>
        If sent, repair Completed, Sent At, both Gmail IDs and Sent From Mailbox
        in Airtable. The app verifies these fields before clearing this attempt.
      </p>
      <div className="reconciliation-outcome">
        <label htmlFor={`attempt-outcome-${attempt.id}`}>
          Verified outcome
        </label>
        <select
          id={`attempt-outcome-${attempt.id}`}
          name="attemptOutcome"
          value={outcome}
          disabled={disabled}
          onChange={(event) => {
            setOutcome(event.target.value as 'sent' | 'not-sent');
            setVerified(false);
          }}
        >
          <option value="sent">Sent — Airtable completion repaired</option>
          {!attempt.confirmation && (
            <option value="not-sent">
              Definitely not sent — manually verified in this mailbox
            </option>
          )}
        </select>
      </div>
      <label
        className="reconciliation-check"
        htmlFor={`attempt-verified-${attempt.id}`}
      >
        <input
          id={`attempt-verified-${attempt.id}`}
          name="attemptVerified"
          type="checkbox"
          checked={verified}
          disabled={disabled}
          onChange={(event) => setVerified(event.target.checked)}
        />
        I verified this particular attempt in the selected mailbox and Airtable.
      </label>
      <button
        className="secondary"
        type="button"
        disabled={disabled || !verified}
        onClick={() => void onReconcile(attempt.id, outcome)}
      >
        Reconcile Attempt
      </button>
    </section>
  );
}
