import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const hasher = new PasswordHasherService();

  // Argon2 is deliberately slow — that is the entire point — so these
  // tests need more than Jest's 5s default.
  jest.setTimeout(30_000);

  describe('hash', () => {
    it('produces a PHC-format argon2id string', async () => {
      const hashed = await hasher.hash('correct horse battery staple');
      expect(hashed).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/u);
    });

    it('never contains the plaintext', async () => {
      const password = 'MySecretPassword123!';
      const hashed = await hasher.hash(password);
      expect(hashed).not.toContain(password);
    });

    it('produces a different hash for the same password every time', async () => {
      // A random per-hash salt is why this holds — and why a precomputed
      // rainbow table is worthless against us.
      const password = 'identical-password';
      const [first, second] = await Promise.all([
        hasher.hash(password),
        hasher.hash(password),
      ]);
      expect(first).not.toBe(second);
    });

    it('handles unicode, including Bangla', async () => {
      // Our users type Bangla. A hasher that mangles non-ASCII would lock
      // them out of their own accounts.
      const password = 'আমারগোপনপাসওয়ার্ড২০২৬';
      const hashed = await hasher.hash(password);
      await expect(hasher.verify(hashed, password)).resolves.toBe(true);
    });

    it('handles very long passwords', async () => {
      const password = 'a'.repeat(1000);
      const hashed = await hasher.hash(password);
      await expect(hasher.verify(hashed, password)).resolves.toBe(true);
    });
  });

  describe('verify', () => {
    it('accepts the correct password', async () => {
      const hashed = await hasher.hash('the-right-one');
      await expect(hasher.verify(hashed, 'the-right-one')).resolves.toBe(true);
    });

    it('rejects the wrong password', async () => {
      const hashed = await hasher.hash('the-right-one');
      await expect(hasher.verify(hashed, 'the-wrong-one')).resolves.toBe(false);
    });

    it('rejects a password differing by one character', async () => {
      const hashed = await hasher.hash('password123');
      await expect(hasher.verify(hashed, 'password124')).resolves.toBe(false);
    });

    it('is case sensitive', async () => {
      const hashed = await hasher.hash('CaseSensitive');
      await expect(hasher.verify(hashed, 'casesensitive')).resolves.toBe(false);
    });

    it('rejects an empty password against a real hash', async () => {
      const hashed = await hasher.hash('not-empty');
      await expect(hasher.verify(hashed, '')).resolves.toBe(false);
    });

    it('returns false for a malformed hash instead of throwing', async () => {
      // Fail closed. A corrupt stored hash must deny access, not raise a
      // 500 that signals to an attacker that they found something odd.
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(hasher.verify('not-a-hash', 'anything')).resolves.toBe(
        false,
      );
      await expect(hasher.verify('', 'anything')).resolves.toBe(false);
      await expect(
        hasher.verify('$argon2id$truncated', 'anything'),
      ).resolves.toBe(false);

      jest.restoreAllMocks();
    });
  });

  describe('needsRehash', () => {
    it('is false for a hash made with current parameters', async () => {
      const hashed = await hasher.hash('current');
      expect(hasher.needsRehash(hashed)).toBe(false);
    });

    it('is true for a hash made with weaker parameters', () => {
      // A hash from an older deployment with a lower memory cost. At the
      // user's next successful login we silently upgrade it — the only
      // moment the plaintext is legitimately available.
      const weak = '$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2g';
      expect(hasher.needsRehash(weak)).toBe(true);
    });

    it('is true for a bcrypt hash from a hypothetical migration', () => {
      const bcrypt =
        '$2b$12$KIXQ0rXqLZ8kZ8kZ8kZ8kOeKZ8kZ8kZ8kZ8kZ8kZ8kZ8kZ8kZ8k';
      expect(hasher.needsRehash(bcrypt)).toBe(true);
    });

    it('is true for an unparseable hash', () => {
      expect(hasher.needsRehash('garbage')).toBe(true);
      expect(hasher.needsRehash('')).toBe(true);
    });
  });

  describe('cost', () => {
    it('takes long enough to make brute force expensive', async () => {
      // Not an exact timing assertion — CI machines vary wildly. This is a
      // regression guard: if someone drops memoryCost to make tests faster,
      // hashing becomes near-instant and this fails loudly.
      const startedAt = Date.now();
      await hasher.hash('timing-check');
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs).toBeGreaterThan(5);
    });
  });
});
