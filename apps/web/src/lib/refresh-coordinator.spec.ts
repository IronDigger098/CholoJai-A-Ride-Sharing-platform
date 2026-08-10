import { describe, expect, it } from '@jest/globals';

import { createRefreshCoordinator } from './refresh-coordinator';

/** A promise plus the handles to settle it later. */
function deferred(): {
  promise: Promise<string>;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
} {
  let resolve!: (value: string) => void;
  let reject!: (reason: Error) => void;

  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('createRefreshCoordinator', () => {
  it('runs one refresh for callers that arrive together', async () => {
    /* The case this exists for: a screen mounts, fires four queries, and all
       four come back 401 within milliseconds. Four refreshes would send the
       same rotating token four times — the first wins and the rest are
       replays of a retired token. */
    const pending = deferred();
    let calls = 0;

    const refresh = createRefreshCoordinator(() => {
      calls += 1;
      return pending.promise;
    });

    const waiting = [refresh(), refresh(), refresh(), refresh()];
    pending.resolve('token-1');

    expect(await Promise.all(waiting)).toEqual([
      'token-1',
      'token-1',
      'token-1',
      'token-1',
    ]);
    expect(calls).toBe(1);
  });

  it('starts a new refresh once the previous one has settled', async () => {
    /* The result is deliberately not cached. The next expiry must fetch a
       new token rather than be handed the one that has just expired too. */
    let calls = 0;
    const refresh = createRefreshCoordinator(() => {
      calls += 1;
      return Promise.resolve(`token-${String(calls)}`);
    });

    expect(await refresh()).toBe('token-1');
    expect(await refresh()).toBe('token-2');
    expect(calls).toBe(2);
  });

  it('rejects every waiting caller when the refresh fails', async () => {
    const pending = deferred();
    const refresh = createRefreshCoordinator(() => pending.promise);

    const waiting = [refresh(), refresh()];
    pending.reject(new Error('refresh token revoked'));

    await expect(Promise.all(waiting)).rejects.toThrow('refresh token revoked');
  });

  it('recovers after a failure instead of latching', async () => {
    /* A failed refresh must clear the in-flight promise. If it did not, one
       transient network error would leave every later refresh resolving
       against a permanently rejected promise, and the user would be signed
       out until they reloaded the page. */
    let calls = 0;
    const refresh = createRefreshCoordinator(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error('network'))
        : Promise.resolve('token-2');
    });

    await expect(refresh()).rejects.toThrow('network');

    expect(await refresh()).toBe('token-2');
  });
});
