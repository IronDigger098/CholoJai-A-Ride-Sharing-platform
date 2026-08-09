import { addPaisa, type Paisa, paisa, subtractPaisa } from '../utils/money';

import { type VehicleType, VehicleType as VehicleTypes } from './vehicle';

/**
 * Fare estimation — the executable form of `docs/domain-model.md` §D2.
 *
 * Lives in `packages/shared` because both sides must agree on it. The API
 * prices a quote and snapshots it onto the ride; the web app shows the
 * breakdown before booking. A second implementation on either side would
 * eventually disagree with the first, and the disagreement would surface
 * as a rider being charged something other than the number they accepted.
 *
 * Pure: no clock, no randomness, no I/O. The same inputs always produce
 * the same fare, which is what makes a quote something you can reproduce
 * when someone disputes it.
 *
 * There is no surge component. `domain-model.md` §D2 mentioned one in
 * prose, but the `rides` table has five fare columns and no surge among
 * them, and surge appears nowhere in the product spec's scope — so the
 * prose was wrong rather than the schema, and D2 has been corrected.
 */

/** Rates for one vehicle type. All amounts are integer paisa. */
export interface PricingRule {
  readonly baseFare: Paisa;
  readonly perKilometre: Paisa;
  readonly perMinute: Paisa;
}

/**
 * Published rates.
 *
 * Constants here rather than rows in a table, for now. Pricing that
 * operations can edit at runtime is a real feature with real
 * consequences — an audit trail, an effective-from date, a way to reprice
 * without touching in-flight quotes — and none of that is in scope.
 * Because every fare is snapshotted onto its ride (D2), moving these into
 * the database later cannot retroactively change a single historic fare.
 */
export const PRICING = {
  BIKE: {
    baseFare: paisa(3000),
    perKilometre: paisa(1100),
    perMinute: paisa(60),
  },
  CNG: {
    baseFare: paisa(5000),
    perKilometre: paisa(1500),
    perMinute: paisa(80),
  },
  CAR: {
    baseFare: paisa(8000),
    perKilometre: paisa(2400),
    perMinute: paisa(130),
  },
} as const satisfies Readonly<Record<VehicleType, PricingRule>>;

export interface FareRequest {
  readonly vehicleType: VehicleType;
  readonly distanceMetres: number;
  readonly durationSeconds: number;
  /** Applied after the components are summed. Clamped so a fare cannot go negative. */
  readonly discount?: Paisa;
}

/**
 * The five numbers that land on the ride.
 *
 * Deliberately the same shape as the `fare_*_paisa` columns in the `rides`
 * table, so snapshotting is a copy rather than a translation — and any
 * mismatch is a compile error rather than a silently wrong receipt.
 */
export interface FareBreakdown {
  readonly base: Paisa;
  readonly distance: Paisa;
  readonly time: Paisa;
  readonly discount: Paisa;
  readonly total: Paisa;
}

const METRES_PER_KILOMETRE = 1000;
const SECONDS_PER_MINUTE = 60;

/**
 * Round to whole paisa.
 *
 * Applied to each component, never to the total. The database enforces
 * `total = base + distance + time - discount`, so rounding a total that
 * was computed from unrounded parts would eventually violate that
 * constraint by a paisa — and a constraint violation at booking is a 500
 * for a rider who did nothing wrong. Rounding the parts makes the sum
 * exact by construction.
 */
function component(rate: Paisa, quantity: number): Paisa {
  return paisa(Math.round(rate * quantity));
}

export function estimateFare({
  vehicleType,
  distanceMetres,
  durationSeconds,
  discount = paisa(0),
}: FareRequest): FareBreakdown {
  if (!Number.isFinite(distanceMetres) || distanceMetres < 0) {
    throw new RangeError(
      `Distance must be a non-negative number of metres, received ${distanceMetres}`,
    );
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new RangeError(
      `Duration must be a non-negative number of seconds, received ${durationSeconds}`,
    );
  }

  const rule = PRICING[vehicleType];

  const base = rule.baseFare;
  const distance = component(
    rule.perKilometre,
    distanceMetres / METRES_PER_KILOMETRE,
  );
  const time = component(rule.perMinute, durationSeconds / SECONDS_PER_MINUTE);

  /* `subtractPaisa` clamps at zero. A discount larger than the fare makes
     the ride free, not a refund — and a negative total would fail the
     column's own non-negative check anyway. */
  const total = subtractPaisa(addPaisa(base, distance, time), discount);

  /* The discount that is *recorded* is the amount actually applied, which
     is not necessarily the amount offered. Storing the offered figure
     would break the arithmetic the database verifies. */
  const applied = subtractPaisa(addPaisa(base, distance, time), total);

  return { base, distance, time, discount: applied, total };
}

/** Every vehicle type priced for the same route — what a quote contains. */
export function estimateAllFares(
  request: Omit<FareRequest, 'vehicleType'>,
): Readonly<Record<VehicleType, FareBreakdown>> {
  return {
    BIKE: estimateFare({ ...request, vehicleType: VehicleTypes.BIKE }),
    CNG: estimateFare({ ...request, vehicleType: VehicleTypes.CNG }),
    CAR: estimateFare({ ...request, vehicleType: VehicleTypes.CAR }),
  };
}
