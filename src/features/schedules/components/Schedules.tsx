'use client';
import { useState } from 'react';

import { useSchedules } from '../hooks/use-schedules';

import { ScheduleForm } from './ScheduleForm';

import type { Schedule } from '@/modules/outreach/schedules';

export function Schedules({ active }: { active: boolean }) {
  const { data, error, busy, command, client } = useSchedules();
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);

  return (
    <section className="schedules" aria-labelledby="schedules-title">
      <div className="mailbox-page-heading">
        <div>
          <h2 id="schedules-title">Schedules</h2>
          <p>
            Select one sending window. Automatic sending is a separate control.
          </p>
        </div>
        {!editing && (
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() => setEditing('new')}
          >
            New Schedule
          </button>
        )}
      </div>
      {error && (
        <p className="notice danger-text" role="alert">
          {error}
        </p>
      )}
      {data?.status.error && (
        <p className="notice danger-text" role="alert">
          {data.status.error}
        </p>
      )}
      {!data && !error && <p role="status">Loading schedules…</p>}
      {data?.schedules.length === 0 && (
        <p>No schedules yet. Create and select one before sending.</p>
      )}
      {editing && (
        <ScheduleForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? undefined : editing}
          busy={busy || (editing !== 'new' && editing.selected && active)}
          onCancel={() => setEditing(null)}
          onSave={async (configuration) => {
            const saved = await command((signal) =>
              editing === 'new'
                ? client.create(configuration, signal)
                : client.change(
                    { action: 'edit', id: editing.id, configuration },
                    signal,
                  ),
            );
            if (saved) {
              setEditing(null);
            }
          }}
        />
      )}
      {data?.schedules.map((schedule) => (
        <article className="schedule-row" key={schedule.id}>
          <div>
            <h3>{schedule.name || 'Unnamed schedule'}</h3>
            <p>
              {schedule.selected ? 'Selected' : 'Unselected'} · Automatic
              sending {schedule.automaticSending ? 'on' : 'off'}
            </p>
            <p>
              {schedule.days.join(', ')} · {schedule.opensAt}–
              {schedule.closesAt} · {schedule.timezone}
            </p>
            <p>Interval: {schedule.intervalSeconds} seconds</p>
          </div>
          <div className="mailbox-actions">
            <button
              className="secondary"
              type="button"
              disabled={
                busy || active || (schedule.selected && !data.status.error)
              }
              onClick={() =>
                void command((signal) =>
                  client.change({ action: 'select', id: schedule.id }, signal),
                )
              }
            >
              Select
            </button>
            <button
              className="secondary"
              type="button"
              disabled={
                busy ||
                (active && schedule.selected && !schedule.automaticSending)
              }
              onClick={() =>
                void command((signal) =>
                  client.change(
                    {
                      action: 'automatic',
                      id: schedule.id,
                      enabled: !schedule.automaticSending,
                    },
                    signal,
                  ),
                )
              }
            >
              {schedule.automaticSending
                ? 'Disable automatic'
                : 'Enable automatic'}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy || (active && schedule.selected)}
              onClick={() => setEditing(schedule)}
            >
              Edit
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy || (active && schedule.selected)}
              onClick={() => setDeleting(schedule)}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {deleting && (
        <section className="notice" aria-label="Confirm schedule deletion">
          <h3>Delete {deleting.name}?</h3>
          <p>
            {deleting.selected
              ? 'Deleting this schedule leaves no selection and blocks sending.'
              : 'This removes the schedule from Airtable.'}
          </p>
          <div className="mailbox-actions">
            <button
              className="secondary"
              type="button"
              disabled={busy || (active && deleting.selected)}
              onClick={async () => {
                if (
                  await command((signal) => client.delete(deleting.id, signal))
                ) {
                  setDeleting(null);
                }
              }}
            >
              Confirm Delete
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel deletion
            </button>
          </div>
        </section>
      )}
      {active && (
        <p>
          Stop the current run before changing its selected schedule. Disabling
          automatic starts does not stop the current run.
        </p>
      )}
    </section>
  );
}
