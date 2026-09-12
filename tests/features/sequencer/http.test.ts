import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireSameOrigin } from '@/infrastructure/http/require-same-origin';
import { proxy } from '@/proxy';

vi.mock('@/infrastructure/config/env', () => ({
  appOrigin: () => 'http://localhost:3000',
}));
afterEach(() => vi.unstubAllEnvs());

describe('operator request protection', () => {
  it('fails closed without configuration and protects the state endpoint', () => {
    vi.stubEnv('APP_PASSWORD', '');
    expect(proxy(new NextRequest('http://localhost:3000/')).status).toBe(503);
    vi.stubEnv('APP_PASSWORD', 'local-test-password');
    expect(
      proxy(new NextRequest('http://localhost:3000/api/sequencer/state'))
        .status,
    ).toBe(401);
    const authorization = `Basic ${Buffer.from('operator:local-test-password').toString('base64')}`;
    expect(
      proxy(
        new NextRequest('http://localhost:3000/', {
          headers: { authorization },
        }),
      ).status,
    ).toBe(200);
  });
  it('rejects missing and cross-site origins on run mutations', () => {
    for (const origin of [null, 'https://elsewhere.example']) {
      const headers = new Headers();
      if (origin) headers.set('origin', origin);
      expect(() =>
        requireSameOrigin(
          new Request('http://localhost:3000/api/sequencer/start', { headers }),
        ),
      ).toThrow('origin');
    }
    expect(() =>
      requireSameOrigin(
        new Request('http://localhost:3000/api/sequencer/start', {
          headers: { origin: 'http://localhost:3000' },
        }),
      ),
    ).not.toThrow();
  });
});
