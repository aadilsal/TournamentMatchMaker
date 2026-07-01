import { describe, expect, it, jest } from '@jest/globals';
import { metaApiKey } from '../middleware/metaAuth.js';

describe('metaApiKey middleware', () => {
  const env = {
    META_API_KEY: 'shared-meta-api-key',
    META_SSH_PUBLIC_KEY: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDQtYp3sfaQfsRelTWXbdnikbVItI91dIu4lvnpcK0Od meta-integration@vrtournament',
  } as any;

  it('accepts requests when the SSH public key header matches the configured key', () => {
    const req = {
      headers: {
        'x-meta-ssh-public-key': env.META_SSH_PUBLIC_KEY,
      },
    } as any;
    const res = {} as any;
    const next = jest.fn();

    metaApiKey(env)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects requests without a valid API key or SSH public key', () => {
    const req = {
      headers: {},
    } as any;
    const res = {} as any;
    const next = jest.fn();

    metaApiKey(env)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((next.mock.calls[0][0] as Error).message).toContain('Invalid Meta API key or SSH public key');
  });
});
