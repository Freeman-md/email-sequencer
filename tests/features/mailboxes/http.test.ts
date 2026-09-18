import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

import { GET as callback } from '@/app/api/gmail/callback/route';
import { GET as connect } from '@/app/api/gmail/connect/route';
import { DELETE as disconnect } from '@/app/api/mailboxes/route';
import { POST as reconcile } from '@/app/api/sequencer/reconcile/route';
import { MailboxReconnectMismatchError } from '@/features/mailboxes/server/service';
import { ConnectionChangeBlockedError } from '@/features/sequencer/server/runtime/sequencer-runtime';

const services = vi.hoisted(() => ({
  mailboxes: {
    beginAuthorization: vi.fn(),
    completeAuthorization: vi.fn(),
    disconnect: vi.fn(),
    getState: vi.fn(),
  },
  connections: { invalidate: vi.fn() },
  sequencer: {
    isActive: vi.fn(),
    reconcile: vi.fn(),
    getDashboardState: vi.fn(),
  },
}));
vi.mock('@/app/server/composition', () => ({
  getSequencerServices: () => services,
}));
vi.mock('@/infrastructure/config/env', () => ({
  appOrigin: () => 'http://localhost:3000',
}));
beforeEach(() => {
  vi.resetAllMocks();
});

it('preserves reconnect intent and sets an HttpOnly state cookie without credentials', async () => {
  services.mailboxes.beginAuthorization.mockResolvedValue({
    state: 'synthetic-state',
    url: 'https://example.test/oauth',
  });
  const response = await connect(
    new Request(
      'http://localhost:3000/api/gmail/connect?mailboxId=recMailboxA',
    ),
  );
  expect(services.mailboxes.beginAuthorization).toHaveBeenCalledWith(
    'recMailboxA',
  );
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(response.headers.get('location')).toBe('https://example.test/oauth');
});

it('blocks cross-site mailbox mutations and requires explicit, particular-attempt reconciliation', async () => {
  const body = JSON.stringify({ mailboxId: 'recMailboxA' });
  const crossSite = await disconnect(
    new Request('http://localhost:3000/api/mailboxes', {
      method: 'DELETE',
      body,
      headers: { origin: 'https://other.test' },
    }),
  );
  expect(crossSite.status).toBe(400);
  expect(services.mailboxes.disconnect).not.toHaveBeenCalled();
  services.mailboxes.getState.mockResolvedValue({ mailboxes: [] });
  const allowed = await disconnect(
    new Request('http://localhost:3000/api/mailboxes', {
      method: 'DELETE',
      body,
      headers: { origin: 'http://localhost:3000' },
    }),
  );
  expect(allowed.status).toBe(200);
  expect(services.mailboxes.disconnect).toHaveBeenCalledWith('recMailboxA');
  const unverified = await reconcile(
    new Request('http://localhost:3000/api/sequencer/reconcile', {
      method: 'POST',
      body: JSON.stringify({
        attemptId: 'attempt-a',
        outcome: 'not-sent',
        verified: false,
      }),
      headers: { origin: 'http://localhost:3000' },
    }),
  );
  expect(unverified.status).toBe(400);
  expect(services.sequencer.reconcile).not.toHaveBeenCalled();
});

it.each(['wrong-account', 'run-active'])(
  'reports a safe actionable callback outcome for %s and does not invalidate connection state',
  async (outcome) => {
    services.mailboxes.completeAuthorization.mockRejectedValue(
      outcome === 'wrong-account'
        ? new MailboxReconnectMismatchError('synthetic')
        : new ConnectionChangeBlockedError('synthetic'),
    );
    const response = await callback(
      new NextRequest(
        'http://localhost:3000/api/gmail/callback?state=synthetic-state&code=synthetic-code',
        { headers: { cookie: 'gmail_oauth_state=synthetic-state' } },
      ),
    );
    expect(response.headers.get('location')).toBe(
      `http://localhost:3000/?gmail=${outcome}`,
    );
    expect(services.connections.invalidate).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  },
);
