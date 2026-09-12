'use client';

import { useState } from 'react';

import {
  DEFAULT_INTERVAL_SECONDS,
  MAX_INTERVAL_SECONDS,
} from '../constants/run';

import type { DashboardState, RunState } from '../types';

export function useDashboardControls({
  data,
  run,
  busy,
  error,
  command,
}: {
  data: DashboardState | null;
  run: RunState;
  busy: boolean;
  error: string | null;
  command: (
    action: 'start' | 'stop',
    intervalSeconds?: number,
  ) => Promise<void>;
}) {
  const [interval, setInterval] = useState(
    String(run.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS),
  );
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const active = run.status === 'running';
  const stopping = run.phase === 'stopping';
  const ready = Boolean(data?.airtable.connected && data?.gmail.connected);
  const seconds = active ? run.intervalSeconds : Number(interval);
  const valid =
    Number.isInteger(seconds) &&
    seconds >= 1 &&
    seconds <= MAX_INTERVAL_SECONDS;
  const reviewErrors = run.errors.filter(
    (entry) => entry.kind === 'uncertain' || entry.kind === 'reconciliation',
  );
  const reviewKey = reviewErrors.length
    ? JSON.stringify([run.runStartedAt, reviewErrors])
    : null;
  const reviewed = reviewKey !== null && reviewedKey === reviewKey;
  const canStart =
    !active && ready && valid && !busy && !error && (!reviewKey || reviewed);
  const canStop = active && !busy && !stopping;

  function start() {
    if (!canStart) return;

    setReviewedKey(null);
    void command('start', seconds);
  }

  function stop() {
    if (canStop) void command('stop');
  }

  return {
    active,
    stopping,
    ready,
    seconds,
    valid,
    reviewed,
    needsReview: reviewKey !== null,
    interval: active ? String(run.intervalSeconds) : interval,
    intervalDisabled: active || busy,
    setInterval,
    setReviewed: (checked: boolean) =>
      setReviewedKey(checked ? reviewKey : null),
    canStart,
    canStop,
    start,
    stop,
    action: active
      ? ('stop' as const)
      : !data?.gmail.connected
        ? ('connect' as const)
        : ('start' as const),
    actionLabel: active
      ? stopping
        ? 'Stopping…'
        : 'Stop Run'
      : busy
        ? 'Starting…'
        : run.runStartedAt
          ? 'Start New Run'
          : 'Start Run',
  };
}
