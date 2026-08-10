import { z } from 'zod';

import { coordinatesSchema } from './geo.contracts';

/**
 * Live driver location — `docs/roadmap.md` M7.
 *
 * Ephemeral by design (domain-model.md D4): positions flow through
 * Socket.IO and the last-known one is cached in Redis. Nothing is written to
 * PostgreSQL, because thousands of inserts per ride buy a trail nobody reads
 * after the journey ends.
 */

/** What a driver publishes. `at` is the driver's clock, for staleness only. */
export const driverLocationSchema = z.object({
  rideId: z.string().min(1).max(64),
  coordinates: coordinatesSchema,
  at: z.string().datetime(),
});

export type DriverLocation = z.infer<typeof driverLocationSchema>;

/** Socket event names, in one place so both sides cannot misspell them. */
export const TRACKING_EVENTS = {
  /** driver → server */
  publish: 'driver:location',
  /** client → server, to start receiving a ride's positions */
  subscribe: 'ride:subscribe',
  /** server → clients watching that ride */
  location: 'ride:driver_location',
} as const;
