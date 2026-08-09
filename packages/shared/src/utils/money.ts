/**
 * Money handling — `docs/database-erd.md` §1.
 *
 * All amounts are integer **paisa** (1 BDT = 100 paisa). Floating point
 * cannot represent decimal fractions exactly (`0.1 + 0.2 !== 0.3`), so a
 * float-based fare eventually produces a receipt whose lines do not sum to
 * its total. Integer minor units is the industry standard.
 *
 * Rule: paisa in the database, paisa over the wire, taka only at render time.
 */

/** Branded type: a plain number cannot be passed where paisa is expected. */
export type Paisa = number & { readonly __brand: 'Paisa' };

export const PAISA_PER_TAKA = 100;

export function paisa(value: number): Paisa {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Paisa must be an integer, received ${value}`);
  }
  if (value < 0) {
    throw new RangeError(`Paisa must not be negative, received ${value}`);
  }
  return value as Paisa;
}

export function takaToPaisa(taka: number): Paisa {
  return paisa(Math.round(taka * PAISA_PER_TAKA));
}

export function paisaToTaka(amount: Paisa): number {
  return amount / PAISA_PER_TAKA;
}

export function addPaisa(...amounts: readonly Paisa[]): Paisa {
  return paisa(amounts.reduce<number>((sum, amount) => sum + amount, 0));
}

/** Subtract, clamped at zero — a discount can never produce a negative fare. */
export function subtractPaisa(minuend: Paisa, subtrahend: Paisa): Paisa {
  return paisa(Math.max(0, minuend - subtrahend));
}

/**
 * Percentage of an amount, rounded half-up to the nearest paisa.
 *
 * `percentX100` is the percentage times 100 (12.5% -> 1250), so discount
 * rates are stored and transported as integers too — same reasoning as the
 * amounts themselves.
 */
export function percentOfPaisa(amount: Paisa, percentX100: number): Paisa {
  if (!Number.isInteger(percentX100)) {
    throw new TypeError(`percentX100 must be an integer, got ${percentX100}`);
  }
  return paisa(Math.round((amount * percentX100) / 10_000));
}

export interface FormatTakaOptions {
  /** Include the ৳ symbol. Default: true. */
  readonly withSymbol?: boolean;
  /** Show paisa precision. Default: false (fares are whole taka). */
  readonly withDecimals?: boolean;
  /** BCP 47 locale. Default: 'en-BD'. */
  readonly locale?: string;
}

/** Render paisa for display. The only place taka appears. */
export function formatTaka(
  amount: Paisa,
  options: FormatTakaOptions = {},
): string {
  const { withSymbol = true, withDecimals = false, locale = 'en-BD' } = options;

  const fractionDigits = withDecimals ? 2 : 0;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(paisaToTaka(amount));

  return withSymbol ? `৳${formatted}` : formatted;
}
