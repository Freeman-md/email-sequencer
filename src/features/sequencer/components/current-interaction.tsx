import type { RunState } from '../types';
import { dateTime } from './format';

export function CurrentInteraction({
  run,
  ready,
  connected,
  interval,
}: {
  run: RunState;
  ready: boolean;
  connected: boolean;
  interval: number;
}) {
  const current = run.current;
  const completed = run.status === 'completed';
  const error = run.status === 'error';
  const active = run.status === 'running';
  let eyebrow = 'READY TO RUN';
  let title = 'All systems ready';
  let description = 'Set the interval, then start sending.';
  let label = 'INTERVAL SECONDS';
  let value = `${interval} seconds`;
  let details = [
    ['DEFAULT', '5 minutes'],
    ['RUN INCLUDES', 'Eligible drafts at start'],
  ];
  if (!ready) {
    eyebrow = 'ACTION REQUIRED';
    title = connected ? 'Check connections' : 'Connect Gmail';
    description = connected
      ? 'Restore the connection before starting a run.'
      : 'Gmail must be connected before a run can start.';
    label = 'CONNECTION';
    value = 'Gmail OAuth';
    details = [
      ['REUSES', 'One Gmail account'],
      ['AIRTABLE', ready ? 'Connected' : 'See connection status above'],
    ];
  }
  if (completed) {
    eyebrow = 'RUN COMPLETED';
    title = 'Run complete';
    description = 'No more eligible interactions.';
    label = 'RESULT';
    value = `${run.sentCount} emails sent`;
    details = [
      ['RUN STARTED', dateTime(run.runStartedAt)],
      ['FINISHED', dateTime(run.finishedAt)],
    ];
  } else if (active || error || run.phase === 'stopped') {
    eyebrow = error
      ? run.errors.at(-1)?.kind === 'uncertain'
        ? 'SEND OUTCOME UNCERTAIN'
        : 'RUN STOPPED'
      : run.phase === 'waiting'
        ? 'LAST PROCESSED INTERACTION'
        : 'CURRENTLY SENDING';
    title =
      current?.prospect ??
      (error
        ? 'Run stopped'
        : run.phase === 'stopped'
          ? 'Run stopped'
          : 'Finding the next email');
    description =
      current?.email ??
      (error
        ? 'Resolve the error before another run.'
        : 'Only eligible drafts from the start of this run are included.');
    label = current ? 'SUBJECT' : 'CURRENT INTERACTION';
    value = current?.subject ?? 'No email selected';
    details = [
      ['PROSPECT', current?.company || '—'],
      ['CREATED AT', dateTime(current?.createdAt ?? null)],
    ];
  }
  return (
    <section className="current" aria-label="Current Interaction">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display">{title}</h2>
      <p className="lead">{description}</p>
      <div className="subject">
        <p className="eyebrow">{label}</p>
        <h3>{value}</h3>
      </div>
      <dl className="details">
        {details.map(([key, val]) => (
          <div key={key}>
            <dt className="eyebrow">{key}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
