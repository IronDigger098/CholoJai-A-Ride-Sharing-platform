import { describe, expect, it } from '@jest/globals';

import {
  addPaisa,
  formatTaka,
  paisa,
  paisaToTaka,
  percentOfPaisa,
  roundUpToTaka,
  subtractPaisa,
  takaToPaisa,
} from './money';

describe('money', () => {
  describe('paisa', () => {
    it('accepts non-negative integers', () => {
      expect(paisa(0)).toBe(0);
      expect(paisa(24_500)).toBe(24_500);
    });

    it('rejects fractional values', () => {
      expect(() => paisa(12.5)).toThrow(TypeError);
    });

    it('rejects negative values', () => {
      expect(() => paisa(-1)).toThrow(RangeError);
    });
  });

  describe('conversion', () => {
    it('round-trips taka through paisa', () => {
      expect(paisaToTaka(takaToPaisa(245))).toBe(245);
    });

    it('rounds fractional taka to the nearest paisa', () => {
      expect(takaToPaisa(12.345)).toBe(1235);
    });

    it('avoids the float error that motivates integer money', () => {
      // 0.1 + 0.2 !== 0.3 in binary floating point. In paisa it is exact.
      expect(addPaisa(takaToPaisa(0.1), takaToPaisa(0.2))).toBe(
        takaToPaisa(0.3),
      );
    });
  });

  describe('arithmetic', () => {
    it('sums a fare breakdown exactly', () => {
      const base = paisa(5000);
      const distance = paisa(18_000);
      const time = paisa(1500);
      expect(addPaisa(base, distance, time)).toBe(24_500);
    });

    it('clamps subtraction at zero so a discount cannot invert a fare', () => {
      expect(subtractPaisa(paisa(1000), paisa(2500))).toBe(0);
    });

    it('computes percentages with half-up rounding', () => {
      // 12.5% of ৳245.00 = ৳30.625 -> 3063 paisa
      expect(percentOfPaisa(paisa(24_500), 1250)).toBe(3063);
    });

    it('rejects fractional percentages', () => {
      expect(() => percentOfPaisa(paisa(100), 12.5)).toThrow(TypeError);
    });
  });

  describe('roundUpToTaka', () => {
    it('rounds a fare up to whole taka', () => {
      expect(roundUpToTaka(paisa(24_463))).toBe(24_500);
    });

    it('leaves whole taka untouched', () => {
      expect(roundUpToTaka(paisa(24_500))).toBe(24_500);
    });
  });

  describe('formatTaka', () => {
    it('renders whole taka with the symbol by default', () => {
      expect(formatTaka(paisa(24_500))).toBe('৳245');
    });

    it('omits the symbol on request', () => {
      expect(formatTaka(paisa(24_500), { withSymbol: false })).toBe('245');
    });

    it('shows paisa when asked', () => {
      expect(formatTaka(paisa(24_563), { withDecimals: true })).toBe('৳245.63');
    });
  });
});
