import { z } from 'zod';

import { coordinatesSchema } from './geo.contracts';

/**
 * Saved places — `docs/roadmap.md` M10b.
 *
 * A rider's shortlist of the addresses they use often. The table has existed
 * since M0 and nothing wrote to it until now, which is why search could not
 * meaningfully cover it: a category that can only ever return nothing is a
 * promise the interface makes and cannot keep.
 *
 * Coordinates are stored alongside the address text, not looked up when
 * used. A geocoder can return a different point for the same string a year
 * later — the rider saved a spot on a map, and that spot is what they meant.
 */

export const savedPlaceSchema = z.object({
  id: z.string(),
  /** What the rider calls it: "Home", "Ma's place", "office". */
  label: z.string(),
  address: z.string(),
  coordinates: coordinatesSchema,
  createdAt: z.string().datetime(),
});

export type SavedPlace = z.infer<typeof savedPlaceSchema>;

/**
 * Saving one.
 *
 * The label is required and free text. An enum of Home/Work would cover the
 * two obvious cases and be wrong for everybody whose life has more than two
 * places in it, which is everybody.
 */
export const createSavedPlaceRequestSchema = z.object({
  label: z.string().trim().min(1).max(60),
  address: z.string().trim().min(1).max(500),
  coordinates: coordinatesSchema,
});

export type CreateSavedPlaceRequest = z.infer<
  typeof createSavedPlaceRequestSchema
>;

export const savedPlaceIdParamSchema = z.object({
  placeId: z.string().min(1).max(64),
});

export type SavedPlaceIdParam = z.infer<typeof savedPlaceIdParamSchema>;

/**
 * All of them, unpaginated.
 *
 * A rider has a handful. Cursor pagination over a list that fits on one
 * screen would be machinery serving nobody — and unlike the support inbox,
 * this one cannot grow without the rider deliberately growing it.
 */
export const savedPlaceListSchema = z.object({
  places: z.array(savedPlaceSchema),
});

export type SavedPlaceList = z.infer<typeof savedPlaceListSchema>;

/** How many a rider may keep. */
export const MAX_SAVED_PLACES = 20;
