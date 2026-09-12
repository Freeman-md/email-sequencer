import { describe, expect, it, vi } from 'vitest';

import { SequencerRuntime } from '@/features/sequencer/server/runtime/sequencer-runtime';
import { ConnectionsService } from '@/features/sequencer/server/services/connections.service';

function setup() {
  const runtime = new SequencerRuntime();
  const interactions = {
    next: vi.fn(),
    complete: vi.fn(),
    checkConnection: vi.fn(),
  };
  const prospects = { findById: vi.fn(), checkConnection: vi.fn() };
  const gmail = {
    checkConnection: vi
      .fn()
      .mockResolvedValue({ connected: true, detail: 'Connected' }),
    completeAuthorization: vi.fn().mockResolvedValue(undefined),
  };
  const connections = new ConnectionsService(
    interactions,
    prospects,
    gmail,
    runtime,
  );

  return { runtime, interactions, gmail, connections };
}

describe('connection coordination', () => {
  it('shares cached checks, refreshes before a run, and invalidates after authorization', async () => {
    const { connections, gmail, interactions } = setup();

    await Promise.all([connections.getState(), connections.getState()]);
    expect(gmail.checkConnection).toHaveBeenCalledTimes(1);

    interactions.checkConnection.mockRejectedValueOnce(
      new Error('Unavailable'),
    );
    await expect(connections.requireReady()).rejects.toThrow('Unavailable');

    await connections.connectGmail('state', 'cookie', 'code');
    expect((await connections.getState()).airtable.connected).toBe(true);
    expect(gmail.checkConnection).toHaveBeenCalledTimes(3);
  });

  it('excludes runs and overlapping mailbox changes, releasing the lock on failure', async () => {
    const { connections, gmail, runtime } = setup();
    let reject!: (error: Error) => void;
    gmail.completeAuthorization.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const authorization = connections.connectGmail('state', 'cookie', 'code');
    const failure = expect(authorization).rejects.toThrow('Failed');

    expect(() => runtime.begin(1)).toThrow('being updated');
    await expect(
      connections.connectGmail('state', 'cookie', 'code'),
    ).rejects.toThrow('Stop the run');
    reject(new Error('Failed'));
    await failure;

    runtime.begin(1);
    await expect(
      connections.connectGmail('state', 'cookie', 'code'),
    ).rejects.toThrow('Stop the run');
    expect(gmail.completeAuthorization).toHaveBeenCalledTimes(1);
    runtime.stop();
    runtime.finish();
  });
});
