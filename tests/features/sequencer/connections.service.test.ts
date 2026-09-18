import { expect, it, vi } from 'vitest';

import { ConnectionsService } from '@/features/sequencer/server/services/connections.service';

it('shares cached checks, refreshes before a run, and invalidates after mailbox changes', async () => {
  const interactions = {
    findById: vi.fn(),
    findNextDraft: vi.fn(),
    confirmSent: vi.fn(),
    checkConnection: vi.fn(),
  };
  const prospects = { findContactById: vi.fn(), checkConnection: vi.fn() };
  const mailboxes = {
    getState: vi.fn().mockResolvedValue({
      mailboxes: [
        {
          id: 'recMailboxA',
          email: 'operator@example.com',
          connected: true,
          hasCredentials: true,
          detail: 'Available',
        },
      ],
    }),
  };
  const connections = new ConnectionsService(
    interactions,
    prospects,
    mailboxes,
  );
  await Promise.all([connections.getState(), connections.getState()]);
  expect(mailboxes.getState).toHaveBeenCalledTimes(1);
  interactions.checkConnection.mockRejectedValueOnce(new Error('Unavailable'));
  await expect(connections.requireReady()).rejects.toThrow('Unavailable');
  connections.invalidate();
  expect((await connections.getState()).gmail.connected).toBe(true);
  expect(mailboxes.getState).toHaveBeenCalledTimes(3);
  mailboxes.getState.mockResolvedValue({ mailboxes: [] });
  await expect(connections.requireReady()).rejects.toThrow(
    'No mailbox available',
  );
});
