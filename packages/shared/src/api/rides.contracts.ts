import { z } from 'zod';

import { RideStatus } from '../domain/ride-status';
import { VehicleType } from '../domain/vehicle';

import { fareBreakdownSchema } from './fares.contracts';
import { coordinatesSchema } from './geo.contracts';

/**
 * Ride contracts — `docs/api-design.md` §Rides.
 */

/**
 * Booking sends an id and a choice, nothing else.
 *
 * Every fact about the journey — where it goes, how far, what it costs —
 * already lives on the quote the server issued. Re-sending any of it would
 * create a second source of truth for the price, and the client's copy would
 * be the one an attacker controls.
 */
export const bookRideRequestSchema = z.object({
  quoteId: z.string().min(1).max(64),
  vehicleType: z.nativeEnum(VehicleType),
});

export type BookRideRequest = z.infer<typeof bookRideRequestSchema>;

/**
 * A ride, as its rider sees it.
 *
 * `fare` is the snapshot, not a reference to the quote (D2). A completed
 * ride's receipt must not change when rates do, so the numbers travel with
 * the ride from the moment it is booked.
 */
export const rideSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(RideStatus),
  vehicleType: z.nativeEnum(VehicleType),
  pickup: coordinatesSchema,
  pickupAddress: z.string(),
  dropoff: coordinatesSchema,
  dropoffAddress: z.string(),
  distanceMetres: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  fare: fareBreakdownSchema,
  requestedAt: z.string().datetime(),
});

export type Ride = z.infer<typeof rideSchema>;

/**
 * A ride id in a path.
 *
 * Bounded rather than matched against a CUID pattern, for the same reason as
 * `userIdParamSchema`: the length check stops an absurd path segment
 * reaching the database, and deciding whether an id is well-formed is the
 * database's job.
 */
export const rideIdParamSchema = z.object({
  rideId: z.string().min(1).max(64),
});

export type RideIdParam = z.infer<typeof rideIdParamSchema>;

/**
 * Cancelling carries an optional free-text reason.
 *
 * Free text rather than an enum of reason codes. Codes are worth having —
 * they are what makes cancellation reporting possible — but a code list
 * invented before anyone has read a hundred real cancellations is a list
 * that will be wrong, and `CANCELLED` already carries `cancelledBy`, which
 * is the part the state machine acts on (D3).
 */
export const cancelRideRequestSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export type CancelRideRequest = z.infer<typeof cancelRideRequestSchema>;

/**
 * Cursor pagination, per `api-design.md` §3.
 *
 * Cursor rather than offset because ride history is written to while a
 * rider reads it. `OFFSET 3` shifts the moment a new ride is inserted, so
 * the rider sees a duplicate or misses a row; seeking on an indexed key is
 * stable and stays flat at depth. The cost is no random page access, which
 * nothing in this product needs.
 *
 * `limit` is capped. Without a ceiling the page size is chosen by the
 * caller, and "give me everything" is one request away from being the
 * slowest query in the system.
 */
export const rideListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(64).optional(),
});

export type RideListQuery = z.infer<typeof rideListQuerySchema>;

/**
 * A page of rides.
 *
 * Written out concretely rather than as a generic `paginated(schema)`
 * helper. The envelope is a platform convention and will eventually wrap
 * several collections, but rides is the first — and `contributing.md`
 * forbids the abstraction until there is a second caller. When admin lists
 * arrive, this shape is what gets promoted.
 */
export const ridePageSchema = z.object({
  data: z.array(rideSchema),
  pageInfo: z.object({
    /** Pass as `cursor` to fetch the next page. Null on the last page. */
    nextCursor: z.string().nullable(),
    hasNextPage: z.boolean(),
  }),
});

export type RidePage = z.infer<typeof ridePageSchema>;

/**
 * The rider's current ride, or explicitly nothing.
 *
 * Wrapped rather than answering 204 for "no active ride". Having no ride in
 * progress is an ordinary, expected state, not an absence of content — and
 * a wrapped null is one shape the client parses every time instead of two
 * that depend on the status code.
 */
export const activeRideResponseSchema = z.object({
  ride: rideSchema.nullable(),
});

export type ActiveRideResponse = z.infer<typeof activeRideResponseSchema>;
