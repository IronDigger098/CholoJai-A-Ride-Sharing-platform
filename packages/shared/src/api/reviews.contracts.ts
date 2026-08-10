import { z } from 'zod';

/**
 * Ride reviews — `docs/domain-model.md` §Reviews.
 *
 * One direction for now: the rider rates the driver. The table already
 * allows two per ride and its constraint is `(ride_id, author_id)` rather
 * than `(ride_id)`, so the driver's side needs no schema change when it
 * arrives — a screen and a second caller of the same service.
 */

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export const createReviewRequestSchema = z.object({
  rating: z.number().int().min(RATING_MIN).max(RATING_MAX),
  /**
   * Optional, and that is the whole point of a star rating.
   *
   * Requiring a sentence is how a rating form becomes a form nobody fills
   * in, and the rating is the part the platform can act on. Someone with
   * something to say will say it.
   */
  comment: z.string().trim().min(1).max(1000).optional(),
});

export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>;

/**
 * A review, as its author sees it.
 *
 * No author or target id. The rider knows who they rated — they were on the
 * ride — and sending the driver's user id to a rider's browser hands out an
 * identifier they have no use for and no business holding.
 */
export const reviewSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  rating: z.number().int().min(RATING_MIN).max(RATING_MAX),
  comment: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type Review = z.infer<typeof reviewSchema>;

/**
 * The caller's review of a ride, or explicitly nothing.
 *
 * Wrapped rather than answering 404, like `/drivers/me` and the active
 * ride. Not having rated a journey yet is the ordinary state, not a missing
 * resource, and one shape is easier to parse than two that depend on the
 * status code.
 */
export const myReviewResponseSchema = z.object({
  review: reviewSchema.nullable(),
});

export type MyReviewResponse = z.infer<typeof myReviewResponseSchema>;
