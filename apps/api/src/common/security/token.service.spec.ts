import { describe, expect, it } from '@jest/globals';

import { TokenService } from './token.service';

describe('TokenService', () => {
  const tokens = new TokenService();

  describe('generate', () => {
    it('returns a URL-safe token and its hash', () => {
      const { plaintext, hash } = tokens.generate();

      // base64url: no +, /, or = to escape in a link.
      expect(plaintext).toMatch(/^[A-Za-z0-9_-]+$/u);
      expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    });

    it('carries 256 bits of entropy', () => {
      // 32 bytes base64url-encoded is 43 characters.
      expect(tokens.generate().plaintext).toHaveLength(43);
    });

    it('never repeats', () => {
      const seen = new Set(
        Array.from({ length: 1000 }, () => tokens.generate().plaintext),
      );
      expect(seen.size).toBe(1000);
    });

    it('produces a hash that does not contain the token', () => {
      // The stored value must reveal nothing about the emailed one.
      const { plaintext, hash } = tokens.generate();
      expect(hash).not.toContain(plaintext);
      expect(hash).not.toBe(plaintext);
    });
  });

  describe('hash', () => {
    it('is deterministic, so a presented token can be looked up', () => {
      const { plaintext } = tokens.generate();
      expect(tokens.hash(plaintext)).toBe(tokens.hash(plaintext));
    });

    it('differs completely for a token differing by one character', () => {
      const first = tokens.hash('token-aaaa');
      const second = tokens.hash('token-aaab');
      expect(first).not.toBe(second);
    });
  });

  describe('matches', () => {
    it('accepts the token that produced the hash', () => {
      const { plaintext, hash } = tokens.generate();
      expect(tokens.matches(plaintext, hash)).toBe(true);
    });

    it('rejects a different token', () => {
      const { hash } = tokens.generate();
      const other = tokens.generate();
      expect(tokens.matches(other.plaintext, hash)).toBe(false);
    });

    it('rejects an empty token', () => {
      const { hash } = tokens.generate();
      expect(tokens.matches('', hash)).toBe(false);
    });

    it('returns false for a malformed stored hash rather than throwing', () => {
      // Fail closed on corrupt data, exactly as password verification does.
      const { plaintext } = tokens.generate();
      expect(tokens.matches(plaintext, 'not-hex')).toBe(false);
      expect(tokens.matches(plaintext, '')).toBe(false);
      expect(tokens.matches(plaintext, 'abcd')).toBe(false);
    });
  });

  describe('expiryFromNow', () => {
    it('returns a future timestamp', () => {
      const expiry = tokens.expiryFromNow(60);
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    });

    it('offsets by the requested number of minutes', () => {
      const before = Date.now();
      const expiry = tokens.expiryFromNow(30);
      const offsetMs = expiry.getTime() - before;

      // Allow a second of slack for slow test machines.
      expect(offsetMs).toBeGreaterThanOrEqual(30 * 60_000 - 1000);
      expect(offsetMs).toBeLessThanOrEqual(30 * 60_000 + 1000);
    });
  });
});
