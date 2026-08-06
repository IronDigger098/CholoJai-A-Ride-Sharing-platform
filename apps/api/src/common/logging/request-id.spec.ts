import { describe, expect, it } from '@jest/globals';

import { isSafeRequestId, resolveRequestId } from './request-id';

describe('request id', () => {
  describe('isSafeRequestId', () => {
    it('accepts well-formed identifiers', () => {
      expect(isSafeRequestId('01J9X2K3M4N5P6Q7R8S9T0')).toBe(true);
      expect(isSafeRequestId('3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071')).toBe(
        true,
      );
      expect(isSafeRequestId('abc_DEF-123')).toBe(true);
    });

    it('rejects values containing newlines', () => {
      // Log forging: a newline lets a caller fabricate log entries that
      // look like they came from the server.
      expect(isSafeRequestId('abc12345\nFAKE LOG LINE')).toBe(false);
      expect(isSafeRequestId('abc12345\r\nSet-Cookie: evil=1')).toBe(false);
    });

    it('rejects values that are too short or too long', () => {
      expect(isSafeRequestId('short')).toBe(false);
      expect(isSafeRequestId('a'.repeat(129))).toBe(false);
      expect(isSafeRequestId('a'.repeat(128))).toBe(true);
    });

    it('rejects punctuation that could break header parsing', () => {
      expect(isSafeRequestId('abc12345; evil')).toBe(false);
      expect(isSafeRequestId('abc12345 with spaces')).toBe(false);
      expect(isSafeRequestId('<script>alert(1)</script>')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isSafeRequestId(undefined)).toBe(false);
      expect(isSafeRequestId(null)).toBe(false);
      expect(isSafeRequestId(12_345_678)).toBe(false);
      expect(isSafeRequestId(['abc12345'])).toBe(false);
    });
  });

  describe('resolveRequestId', () => {
    it('reuses a well-formed client id so one action shares one id', () => {
      const clientId = '3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071';
      expect(resolveRequestId(clientId)).toBe(clientId);
    });

    it('generates a fresh id when the header is absent', () => {
      const id = resolveRequestId(undefined);
      expect(isSafeRequestId(id)).toBe(true);
    });

    it('replaces a malicious id rather than rejecting the request', () => {
      // Correlation is a convenience; failing a request over a malformed
      // optional header would be hostile. Replace silently.
      const id = resolveRequestId('evil\nX-Admin: true');
      expect(id).not.toContain('\n');
      expect(isSafeRequestId(id)).toBe(true);
    });

    it('generates unique ids', () => {
      const ids = new Set(
        Array.from({ length: 100 }, () => resolveRequestId(undefined)),
      );
      expect(ids.size).toBe(100);
    });
  });
});
