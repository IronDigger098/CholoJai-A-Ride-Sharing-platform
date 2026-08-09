import { describe, expect, it } from '@jest/globals';

import {
  contrastRatio,
  isInSrgbGamut,
  parseOklch,
  toLinearSrgb,
} from '../testing/color';
import { readThemeTokens, resolveToken } from '../testing/theme-tokens';

/**
 * The palette's guarantees, enforced.
 *
 * A colour system fails quietly. Nobody notices that muted text slipped
 * from 4.6:1 to 4.2:1, or that a colour drifted outside the sRGB gamut and
 * is being clipped to a different hue — the page still looks broadly
 * right, and the people it excludes are not the people reviewing it.
 * These tests make that failure loud.
 */

const tokens = readThemeTokens();

const SCHEMES = ['light', 'dark'] as const;

/* WCAG 2.2 thresholds. 4.5:1 is AA for body text, 3:1 is AA for large text
   and for non-text UI boundaries (1.4.11), and 7:1 is AAA — held for the
   primary text colour because that is the one people read for minutes at a
   time, and because the palette reaches it comfortably. */
const PAIRINGS = [
  { foreground: 'content', background: 'surface', minimum: 7 },
  { foreground: 'content', background: 'surface-raised', minimum: 7 },
  { foreground: 'content-muted', background: 'surface', minimum: 4.5 },
  { foreground: 'content-subtle', background: 'surface', minimum: 4.5 },
  { foreground: 'accent', background: 'surface', minimum: 4.5 },
  { foreground: 'accent-content', background: 'accent', minimum: 4.5 },
  { foreground: 'action-content', background: 'action', minimum: 4.5 },
  { foreground: 'danger', background: 'surface', minimum: 4.5 },
  { foreground: 'success', background: 'surface', minimum: 4.5 },
  { foreground: 'border-strong', background: 'surface', minimum: 3 },
] as const;

describe('palette', () => {
  it('is not empty', () => {
    // Guards the parser as much as the palette: a regex that silently
    // matches nothing would make every other test in this file vacuous.
    expect(tokens.palette.size).toBeGreaterThan(40);
  });

  it('is entirely inside the sRGB gamut', () => {
    const outside = [...tokens.palette]
      .filter(([, value]) => {
        const color = parseOklch(value);
        return color !== null && !isInSrgbGamut(toLinearSrgb(color));
      })
      .map(([name]) => name);

    expect(outside).toEqual([]);
  });

  it('declares every colour in oklch', () => {
    /* Mixing notations is how a palette loses its even lightness ramp: a
       hex value dropped in "just this once" has no perceptual relationship
       to the steps around it. */
    const wrongNotation = [...tokens.palette]
      .filter(([, value]) => parseOklch(value) === null)
      .map(([name]) => name);

    expect(wrongNotation).toEqual([]);
  });
});

describe('semantic tokens', () => {
  it('define the same names in both schemes', () => {
    /* A token added to one scheme only inherits the other scheme's value,
       so the page looks correct in the mode its author was using and wrong
       in the other. */
    expect([...tokens.dark.keys()].sort()).toEqual(
      [...tokens.light.keys()].sort(),
    );
  });

  it('keep the two dark declarations in step', () => {
    /* Dark values are written twice — once under `prefers-color-scheme`,
       once under `[data-theme='dark']` — because CSS cannot share a
       declaration block between a media query and a selector. That
       duplication is a maintenance hazard, so it is pinned here: change
       one and this fails until you change the other. */
    expect(Object.fromEntries(tokens.darkFromMediaQuery)).toEqual(
      Object.fromEntries(tokens.dark),
    );
  });

  it.each(SCHEMES)('resolve to real colours in %s', (scheme) => {
    for (const name of tokens.light.keys()) {
      expect(() => resolveToken(tokens, scheme, name)).not.toThrow();
    }
  });
});

describe.each(SCHEMES)('contrast in %s', (scheme) => {
  it.each(PAIRINGS)(
    '$foreground on $background meets $minimum:1',
    ({ foreground, background, minimum }) => {
      const ratio = contrastRatio(
        toLinearSrgb(resolveToken(tokens, scheme, foreground)),
        toLinearSrgb(resolveToken(tokens, scheme, background)),
      );

      /* Reported to two decimals so a failure says how far off it is —
         "4.42, needed 4.5" is a nudge, "2.1, needed 4.5" is a rethink. */
      expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(minimum);
    },
  );
});
