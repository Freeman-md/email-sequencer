import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  writeFile,
  unlink,
  lstat,
} from 'node:fs/promises';
import { dirname } from 'node:path';

import { tokenSchema } from './schemas';

import type { TokenStore } from './interfaces/token-store.interface';
import type { StoredToken } from './schemas';

export class FileTokenStore implements TokenStore {
  constructor(private readonly path: string) {}

  async read(): Promise<StoredToken | null> {
    const path = this.path;

    try {
      const stat = await lstat(path);
      if (!stat.isFile() || (stat.mode & 0o077) !== 0)
        throw new Error('Unsafe token permissions');

      return tokenSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return null;
      throw new Error(
        'Gmail token file is unreadable or insecure. Check GMAIL_TOKEN_FILE and set file permissions to 600.',
      );
    }
  }

  async write(token: StoredToken): Promise<void> {
    const path = this.path;
    const temporary = `${path}.${randomUUID()}.tmp`;

    try {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify(tokenSchema.parse(token)), {
        mode: 0o600,
        flag: 'wx',
      });
      await rename(temporary, path);
    } catch {
      await unlink(temporary).catch(() => undefined);
      throw new Error(
        'Cannot save the Gmail connection. Check token directory ownership and write permissions.',
      );
    }
  }
}
