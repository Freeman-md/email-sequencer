'use client';
import { useEffect, useRef, useState } from 'react';

import { followUpsClient } from '../api/client';
import { initialPreparationState } from '../types/preparation';

import type { IFollowUpsClient } from '../api/interfaces/client.interface';

export function useFollowUps(client: IFollowUpsClient = followUpsClient) {
  const [state, setState] = useState(initialPreparationState);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const pending = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const expected = version.current;

      try {
        if (pending.current) return;
        const result = await client.getState(controller.signal);
        if (!controller.signal.aborted && expected === version.current) {
          setState(result);
          setError(null);
        }
      } catch {
        if (!controller.signal.aborted && expected === version.current)
          setError(
            'Cannot read preparation status. The server may still be preparing drafts.',
          );
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
      }
    }
    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client]);
  async function prepare() {
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted || pending.current) return;
    pending.current = true;
    version.current++;
    setBusy(true);

    try {
      const result = await client.prepare(controller.signal);
      if (!controller.signal.aborted) {
        setState(result);
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Preparation request failed. Check status before trying again.',
        );
    } finally {
      version.current++;
      pending.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return { state, error, busy: busy || state.status === 'running', prepare };
}
