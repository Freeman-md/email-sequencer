'use client';
import { useEffect, useRef, useState } from 'react';

import { schedulesClient } from '../api/client';

import type { ISchedulesClient } from '../api/interfaces/client.interface';
import type { SchedulesState } from '../types/state';

export function useSchedules(client: ISchedulesClient = schedulesClient) {
  const [data, setData] = useState<SchedulesState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lifecycle = useRef<AbortController | null>(null);
  const version = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const current = version.current;

      try {
        if (pending.current) {
          return;
        }
        const state = await client.getState(controller.signal);
        if (!controller.signal.aborted && version.current === current) {
          setData(state);
          setError(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted && version.current === current) {
          setError(
            cause instanceof Error ? cause.message : 'Schedules unavailable.',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          timer = setTimeout(poll, 10000);
        }
      }
    }
    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client]);

  async function command(
    operation: (signal: AbortSignal) => Promise<SchedulesState>,
  ) {
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted || pending.current) {
      return false;
    }
    pending.current = true;
    version.current++;
    setBusy(true);

    try {
      const state = await operation(controller.signal);
      if (!controller.signal.aborted) {
        setData(state);
        setError(null);
      }

      return true;
    } catch (cause) {
      if (!controller.signal.aborted) {
        setData(null);
        setError(
          cause instanceof Error ? cause.message : 'Schedule change failed.',
        );
      }

      return false;
    } finally {
      pending.current = false;
      version.current++;
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  }

  return { data, error, busy, command, client };
}
