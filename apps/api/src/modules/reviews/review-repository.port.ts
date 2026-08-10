/**
 * What the reviews feature needs from persistence.
 *
 * Two operations, because there are two things a rider can do with a
 * rating: leave one, and see the one they left.
 */

export interface CreateReviewInput {
  readonly rideId: string;
  readonly authorId: string;
  /** The user being rated, not their driver profile. */
  readonly targetId: string;
  readonly rating: number;
  readonly comment?: string | undefined;
}

export interface ReviewRecord {
  readonly id: string;
  readonly rideId: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly createdAt: Date;
}

export interface ReviewRepository {
  /**
   * Store a rating and refresh the target's average, atomically.
   *
   * The average on `driver_profiles` is a cache of what the reviews table
   * already says. Writing the review and refreshing the cache in separate
   * statements means a failure between them leaves a driver whose displayed
   * rating disagrees with their reviews — permanently, because nothing
   * would ever recompute it.
   *
   * Throws `AlreadyRatedError` when the `(ride_id, author_id)` index
   * refuses a second rating.
   */
  create(input: CreateReviewInput): Promise<ReviewRecord>;

  findByRideAndAuthor(
    rideId: string,
    authorId: string,
  ): Promise<ReviewRecord | null>;
}

export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');
