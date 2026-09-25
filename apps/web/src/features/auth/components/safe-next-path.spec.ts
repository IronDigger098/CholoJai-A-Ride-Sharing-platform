import { describe, expect, it } from '@jest/globals';

import { safeNextPath } from './login-form';

jest.mock('next/navigation', () => ({ useSearchParams: jest.fn() }));

describe('safeNextPath', () => {
  it('returns to the page that asked for a sign-in', () => {
    expect(safeNextPath('/rides/abc')).toBe('/rides/abc');
  });

  it('defaults to booking when nothing asked', () => {
    expect(safeNextPath(null)).toBe('/book');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
  ])('refuses %s, which would leave the site', (next) => {
    expect(safeNextPath(next)).toBe('/book');
  });
});
