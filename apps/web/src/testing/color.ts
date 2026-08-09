/**
 * Colour maths for the theme tests.
 *
 * Test-only. It exists because the palette makes a claim — every text
 * pairing meets WCAG AA — that cannot be checked by looking at the CSS,
 * and a claim nothing verifies is a claim that quietly stops being true.
 *
 * The conversion is OKLCH → OKLab → LMS → linear sRGB, following the
 * published matrices. Working in linear sRGB is not incidental: WCAG's
 * relative luminance is defined on linearised channels, so converting to
 * hex first and back would add a rounding step for no reason.
 */

export interface Oklch {
  readonly lightness: number;
  readonly chroma: number;
  readonly hue: number;
}

/** Linear-light sRGB. Values outside 0–1 are outside the gamut. */
export type LinearRgb = readonly [number, number, number];

const OKLCH_PATTERN =
  /^oklch\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:deg)?\s*\)$/u;

export function parseOklch(value: string): Oklch | null {
  const match = OKLCH_PATTERN.exec(value.trim());

  if (match === null) return null;

  const [, lightness, chroma, hue] = match;

  /* Explicit rather than non-null assertions: with three capture groups a
     successful match always has them, but `noUncheckedIndexedAccess` is
     right to insist the compiler be told so rather than assume it. */
  if (lightness === undefined || chroma === undefined || hue === undefined) {
    return null;
  }

  return {
    lightness: Number(lightness),
    chroma: Number(chroma),
    hue: Number(hue),
  };
}

export function toLinearSrgb({ lightness, chroma, hue }: Oklch): LinearRgb {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);

  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

/**
 * Is the colour actually displayable?
 *
 * OKLCH can describe colours sRGB cannot reproduce. A browser clips those
 * to the nearest displayable value, which shifts the hue as well as the
 * chroma — so the palette on paper stops matching the palette on screen,
 * with nothing to indicate it happened. The tolerance absorbs floating
 * point noise at the exact boundary, nothing more.
 */
export function isInSrgbGamut([red, green, blue]: LinearRgb): boolean {
  return [red, green, blue].every(
    (channel) => channel >= -0.001 && channel <= 1.001,
  );
}

function relativeLuminance([red, green, blue]: LinearRgb): number {
  const clamp = (channel: number): number => Math.min(1, Math.max(0, channel));

  return 0.2126 * clamp(red) + 0.7152 * clamp(green) + 0.0722 * clamp(blue);
}

/** WCAG 2.2 contrast ratio, between 1 (identical) and 21 (black on white). */
export function contrastRatio(a: LinearRgb, b: LinearRgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}
