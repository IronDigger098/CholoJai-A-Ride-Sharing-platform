import { z } from 'zod';

/**
 * Geo contracts — `docs/api-design.md` §Geo.
 *
 * Routing only. Geocoding (`/geo/search`, `/geo/reverse`) stays in M6 with
 * the map UI that needs it; routing arrives now because the fare quote is
 * its first consumer and a quote cannot be priced without a distance and a
 * duration. Same reasoning that moved Redis from M2 to M3.
 *
 * The browser never calls a routing provider directly (ADR-006). Proxying
 * server-side is what lets the response be cached across users, keeps any
 * future API key out of client code, and means swapping providers is one
 * module rather than a frontend release.
 */

/**
 * A point on the globe.
 *
 * Bounded to real latitudes and longitudes rather than to Bangladesh. A
 * country box would be a business rule wearing a validation costume, and it
 * would reject the first legitimate cross-border trip without anyone
 * remembering this schema exists. Where service is offered is a question for
 * the fares module, which can answer it with a message that says so.
 */
export const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

export type Coordinates = z.infer<typeof coordinatesSchema>;

export const routeRequestSchema = z.object({
  pickup: coordinatesSchema,
  dropoff: coordinatesSchema,
});

export type RouteRequest = z.infer<typeof routeRequestSchema>;

/**
 * What a route is, as far as this platform is concerned.
 *
 * Deliberately not the geometry. Nothing in M5 draws a line on a map — the
 * fare needs two integers — and returning a polyline would mean caching
 * kilobytes per route and committing to a shape before anything renders it.
 * M6 can widen this when the map is the thing asking.
 *
 * Integers because `estimateFare` takes metres and seconds, and because a
 * float here would eventually be multiplied by a rate and reintroduce the
 * rounding problem that integer paisa exists to prevent.
 */
export const routeResponseSchema = z.object({
  distanceMetres: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
});

export type RouteResponse = z.infer<typeof routeResponseSchema>;
