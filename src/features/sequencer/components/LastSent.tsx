import { dateTime } from '../utils/format';

import type { SentInteraction } from '../types';

export function LastSent({ sent }: { sent: SentInteraction | null }) {
  return (
    <section className="last-sent" aria-labelledby="last-sent-title">
      <div className="last-heading">
        <h2 id="last-sent-title">Last sent</h2>
        <p>Most recent confirmed Gmail send.</p>
      </div>
      <dl className="last-fields">
        <div>
          <dt className="eyebrow">PROSPECT</dt>
          <dd>
            <strong>{sent?.prospect ?? '—'}</strong>
            {sent?.company && <small>{sent.company}</small>}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">EMAIL</dt>
          <dd>{sent?.email ?? '—'}</dd>
        </div>
        <div>
          <dt className="eyebrow">SUBJECT</dt>
          <dd>
            {sent?.subject ?? 'No emails sent in this application session.'}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">SENT AT</dt>
          <dd>{dateTime(sent?.sentAt ?? null)}</dd>
        </div>
      </dl>
    </section>
  );
}
