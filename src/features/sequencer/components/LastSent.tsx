import { dateTime } from '../utils/format';

import type { SentInteraction } from '../types';

export function LastSent({ sent }: { sent: SentInteraction | null }) {
  return (
    <section className="last-sent" aria-labelledby="last-sent-title">
      <h2 id="last-sent-title">Last confirmed send</h2>
      <p className="last-recipient">
        {sent ? `${sent.prospect} · ${sent.email}` : 'No confirmed sends yet'}
      </p>
      {sent && (
        <>
          <p>{sent.subject}</p>
          <p>{sent.company}</p>
          <p>Confirmed {dateTime(sent.sentAt)}</p>
        </>
      )}
    </section>
  );
}
