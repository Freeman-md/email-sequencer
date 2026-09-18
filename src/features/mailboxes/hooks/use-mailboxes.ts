'use client';

import { useEffect, useRef, useState } from 'react';

import { mailboxesClient } from '../api/client';

import type { MailboxesState } from '../types/mailbox';

export function useMailboxes() {
  const [state, setState] = useState<MailboxesState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const version = useRef(0);
  const pending = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const expectedVersion = version.current;

      try {
        if (pending.current) {
          return;
        }
        const result = await mailboxesClient.getState(controller.signal);
        if (!controller.signal.aborted && version.current === expectedVersion) {
          setState(result);
          setError(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted && version.current === expectedVersion) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Mailbox connection check failed.',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          timer = setTimeout(poll, 10_000);
        }
      }
    }
    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  async function disconnect(mailboxId: string) {
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted || pending.current) {
      return;
    }
    version.current++;
    pending.current = true;
    setBusyId(mailboxId);

    try {
      const result = await mailboxesClient.disconnect(
        mailboxId,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setState(result);
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Disconnect was not confirmed. Refresh before trying again.',
        );
      }
    } finally {
      version.current++;
      pending.current = false;
      if (!controller.signal.aborted) {
        setBusyId(null);
      }
    }
  }

  return { state, error, busyId, disconnect };
}
