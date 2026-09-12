import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileTokenStore } from '@/infrastructure/gmail/token-store';

const fs = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  lstat: vi.fn(),
}));
vi.mock('node:fs/promises', () => fs);

beforeEach(() => vi.resetAllMocks());

describe('token storage safeguards', () => {
  it('distinguishes missing storage from unsafe permissions without reading an unsafe file', async () => {
    const store = new FileTokenStore('/fake/gmail.json');
    fs.lstat.mockRejectedValueOnce({ code: 'ENOENT' });
    expect(await store.read()).toBeNull();

    fs.lstat.mockResolvedValue({ isFile: () => true, mode: 0o644 });
    await expect(store.read()).rejects.toThrow('unreadable or insecure');
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('replaces the stored token only after writing a private temporary file', async () => {
    const store = new FileTokenStore('/fake/gmail.json');
    const token = {
      refreshToken: 'fake-refresh',
      email: 'operator@example.com',
    };
    await store.write(token);

    const temporary = fs.writeFile.mock.calls[0]?.[0];
    expect(fs.writeFile).toHaveBeenCalledWith(
      temporary,
      JSON.stringify(token),
      { mode: 0o600, flag: 'wx' },
    );
    expect(fs.rename).toHaveBeenCalledWith(temporary, '/fake/gmail.json');
    expect(fs.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      fs.rename.mock.invocationCallOrder[0]!,
    );

    fs.rename.mockClear();
    fs.writeFile.mockRejectedValueOnce(new Error('Disk full'));
    fs.unlink.mockResolvedValue(undefined);
    await expect(store.write(token)).rejects.toThrow('Cannot save');
    expect(fs.rename).not.toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalled();
  });
});
