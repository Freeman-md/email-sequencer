'use client';
import { useState } from 'react';

import {
  NEW_SCHEDULE_DEFAULTS,
  WEEKDAYS,
  validateSchedule,
} from '@/modules/outreach/schedules';

import type { ScheduleConfiguration } from '@/modules/outreach/schedules';

export function ScheduleForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial?: ScheduleConfiguration;
  busy: boolean;
  onSave: (configuration: ScheduleConfiguration) => Promise<void>;
  onCancel: () => void;
}) {
  const [configuration, setConfiguration] = useState<ScheduleConfiguration>(
    initial
      ? {
          name: initial.name,
          days: initial.days,
          opensAt: initial.opensAt,
          closesAt: initial.closesAt,
          timezone: initial.timezone,
          intervalSeconds: initial.intervalSeconds,
        }
      : structuredClone(NEW_SCHEDULE_DEFAULTS),
  );
  const [error, setError] = useState<string | null>(null);
  function change<K extends keyof ScheduleConfiguration>(
    key: K,
    value: ScheduleConfiguration[K],
  ) {
    setConfiguration((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <form
      className="schedule-form"
      onSubmit={async (event) => {
        event.preventDefault();

        try {
          const valid = validateSchedule(configuration);
          setError(null);
          await onSave(valid);
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : 'Invalid schedule.',
          );
        }
      }}
    >
      <h3>{initial ? 'Edit schedule' : 'New schedule'}</h3>
      <label>
        Name
        <input
          name="name"
          required
          maxLength={120}
          value={configuration.name}
          onChange={(event) => change('name', event.target.value)}
          disabled={busy}
        />
      </label>
      <fieldset disabled={busy}>
        <legend>Days</legend>
        <div className="schedule-days">
          {WEEKDAYS.map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                name="days"
                value={day}
                checked={configuration.days.includes(day)}
                onChange={(event) =>
                  change(
                    'days',
                    event.target.checked
                      ? [...configuration.days, day]
                      : configuration.days.filter(
                          (selected) => selected !== day,
                        ),
                  )
                }
              />
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="schedule-fields">
        <label>
          Opens at
          <input
            name="opensAt"
            type="time"
            required
            value={configuration.opensAt}
            onChange={(event) => change('opensAt', event.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Closes at
          <input
            name="closesAt"
            type="time"
            required
            value={configuration.closesAt}
            onChange={(event) => change('closesAt', event.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Timezone
          <input
            name="timezone"
            required
            value={configuration.timezone}
            onChange={(event) => change('timezone', event.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Interval seconds
          <input
            name="intervalSeconds"
            type="number"
            required
            min={1}
            max={86400}
            step={1}
            value={configuration.intervalSeconds}
            onChange={(event) =>
              change('intervalSeconds', Number(event.target.value))
            }
            disabled={busy}
          />
        </label>
      </div>
      {error && (
        <p className="danger-text" role="alert">
          {error}
        </p>
      )}
      {!initial && (
        <p>New schedules are unselected with automatic sending off.</p>
      )}
      <div className="mailbox-actions">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save schedule'}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
