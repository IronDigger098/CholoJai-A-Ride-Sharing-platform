import { z } from 'zod';

import { VehicleType } from '../domain/vehicle';

import { appliedCouponSchema, couponCodeSchema } from './coupons.contracts';
import { coordinatesSchema } from './geo.contracts';

/**
 * Fare quote contracts — `docs/api-design.md` §Fares.
 *
 * A quote is a priced offer for a proposed route, valid briefly. Booking
 * consumes one (D2): its chosen line becomes the ride's fare snapshot, which
 * is why the breakdown travels here in the same five-part shape the `rides`
 * table stores.
 */

/**
 * Addresses come from the client; coordinates decide the price.
 *
 * The distance and duration are measured server-side from the coordinates,
 * so the address text cannot influence what anything costs — it is display
 * copy, carried so a receipt can say "Dhanmondi" rather than a pair of
 * decimals. Until M6's geocoding proxy exists there is nothing else to
 * derive it from, and inventing a reverse-geocode dependency to produce a
 * string nobody prices would be the wrong trade.
 */
export const fareQuoteRequestSchema = z.object({
  pickup: coordinatesSchema,
  pickupAddress: z.string().min(1).max(500),
  dropoff: coordinatesSchema,
  dropoffAddress: z.string().min(1).max(500),
  /**
   * A discount code, applied while pricing rather than at booking.
   *
   * Optional because most quotes have none. Sent here rather than to a
   * separate "validate this code" endpoint so there is one moment where a
   * price is decided — a rider who is told a code is valid and then quoted
   * without it has been told two different things.
   */
  couponCode: couponCodeSchema.optional(),
});

export type FareQuoteRequest = z.infer<typeof fareQuoteRequestSchema>;

/**
 * The five numbers that will land on the ride.
 *
 * Plain integers rather than the branded `Paisa` type: a Zod schema cannot
 * express a brand, and the brand's job is to stop a bare number being passed
 * where paisa is expected *inside* the codebase. Over the wire it is an
 * integer count of paisa, and `money.ts` is what turns it back into a
 * branded value on either side.
 */
export const fareBreakdownSchema = z.object({
  base: z.number().int().nonnegative(),
  distance: z.number().int().nonnegative(),
  time: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const fareOptionSchema = z.object({
  vehicleType: z.nativeEnum(VehicleType),
  breakdown: fareBreakdownSchema,
});

export type FareOption = z.infer<typeof fareOptionSchema>;

/**
 * A quote, as the rider receives it.
 *
 * `options` is an array rather than a map keyed by vehicle type, because
 * order is meaningful: the picker shows cheapest first, and that ordering is
 * a property of the offer rather than something each client re-derives.
 *
 * `expiresAt` is absolute rather than a duration. A TTL in seconds starts
 * counting from whenever the client happens to read it, which on a slow
 * connection is not when the server issued it — and the server is the only
 * party whose clock decides whether booking succeeds.
 */
export const fareQuoteResponseSchema = z.object({
  id: z.string().min(1),
  distanceMetres: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
  options: z.array(fareOptionSchema).min(1),
  /**
   * The campaign that priced this quote, or null.
   *
   * What it took off is already in each option's `discount`. This says which
   * offer did it, so the picker can name it rather than leaving a rider to
   * work out why the number moved.
   */
  appliedCoupon: appliedCouponSchema.nullable(),
});

export type FareQuoteResponse = z.infer<typeof fareQuoteResponseSchema>;
