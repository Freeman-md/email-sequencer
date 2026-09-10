'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { POLL_INTERVAL_MS } from '../constants/run';
import type { DashboardState, RunState } from '../types';

export function useSequencer(initial: DashboardState | null) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(0);
  const offset = useRef(0);
  const version = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      const expectedVersion = version.current;
      try {
        const response = await fetch('/api/sequencer/state', {
          cache: 'no-store',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(25_000),
          ]),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? 'Unable to read run state.');
        if (alive && version.current === expectedVersion) {
          offset.current = Date.parse(result.serverNow) - Date.now();
          setData(result);
          setError(null);
        }
      } catch (cause) {
        if (alive)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Connection lost. The server may still be running.',
          );
      } finally {
        if (alive) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    void poll();
    const ticking = setInterval(
      () => setClock(Date.now() + offset.current),
      1000,
    );
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
      clearInterval(ticking);
    };
  }, []);

  const command = useCallback(
    async (action: 'start' | 'stop', intervalSeconds?: number) => {
      setBusy(true);
      version.current++;
      try {
        const response = await fetch(`/api/sequencer/${action}`, {
          method: 'POST',
          signal: AbortSignal.timeout(15_000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intervalSeconds }),
        });
        const result: RunState & { error?: string } = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? 'Unable to update the run.');
        version.current++;
        setData((previous) =>
          previous ? { ...previous, run: result } : previous,
        );
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Request failed. Check the current run state before trying again.',
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    data,
    error,
    busy,
    command,
    now: clock || Date.parse(data?.serverNow ?? '') || 0,
  };
}
