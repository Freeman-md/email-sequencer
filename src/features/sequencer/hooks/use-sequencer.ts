'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { sequencerClient } from '../api/client';
import { POLL_INTERVAL_MS } from '../constants/run';

import type { ISequencerClient } from '../api/interfaces/client.interface';
import type { DashboardState } from '../types';
import type { ServerClockSample } from './use-server-clock';

export function useSequencer(
  initial: DashboardState | null,
  client: ISequencerClient = sequencerClient,
) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clockSample, setClockSample] = useState<ServerClockSample | null>(
    null,
  );
  const version = useRef(0);
  const pendingCommand = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const expectedVersion = version.current;

      try {
        if (pendingCommand.current) return;

        const result = await client.getState(controller.signal);
        if (!controller.signal.aborted && version.current === expectedVersion) {
          setClockSample({
            serverNow: result.serverNow,
            receivedAt: Date.now(),
          });
          setData(result);
          setError(null);
        }
      } catch (cause) {
        // An older request must not replace either the state or error from a command.
        if (!controller.signal.aborted && version.current === expectedVersion) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Connection lost. The server may still be running.',
          );
        }
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client]);

  const command = useCallback(
    async (action: 'start' | 'stop', intervalSeconds?: number) => {
      const controller = lifecycle.current;
      if (!controller || controller.signal.aborted || pendingCommand.current)
        return;

      pendingCommand.current = true;
      version.current++;
      setBusy(true);

      try {
        if (action === 'start' && intervalSeconds === undefined) {
          throw new Error('Provide Interval Seconds before starting.');
        }

        const result =
          action === 'start'
            ? await client.start(intervalSeconds!, controller.signal)
            : await client.stop(controller.signal);

        if (!controller.signal.aborted) {
          setData((previous) =>
            previous ? { ...previous, run: result } : previous,
          );
          setError(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Request failed. Check the current run state before trying again.',
          );
        }
      } finally {
        version.current++;
        pendingCommand.current = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [client],
  );

  async function reconcile(attemptId: string, outcome: 'sent' | 'not-sent') {
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted || pendingCommand.current) {
      return;
    }
    pendingCommand.current = true;
    version.current++;
    setBusy(true);

    try {
      const result = await client.reconcile(
        attemptId,
        outcome,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setData(result);
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error ? cause.message : 'Reconciliation failed.',
        );
      }
    } finally {
      version.current++;
      pendingCommand.current = false;
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  }

  return { data, error, busy, command, clockSample, reconcile };
}
