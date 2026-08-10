import {
  type CreateReviewInput,
  type ReviewRecord,
  type ReviewRepository,
} from '../modules/reviews/review-repository.port';
import { AlreadyRatedError } from '../modules/reviews/reviews.errors';

/**
 * In-memory {@link ReviewRepository}.
 *
 * The uniqueness check mirrors the `(ride_id, author_id)` index, because a
 * fake that let one rider rate a ride twice would make the service's tests
 * agree with a system that behaves differently.
 *
 * What it deliberately does not reproduce is the rating rollup. That is one
 * transaction spanning two tables, and a fake asserting it would only prove
 * the fake agrees with itself — `prisma-review.repository.int-spec.ts`
 * checks it against a real database instead.
 */
export class InMemoryReviewRepository implements ReviewRepository {
  /** Author and target are kept so tests can assert who rated whom. */
  public readonly rows: (ReviewRecord & {
    authorId: string;
    targetId: string;
  })[] = [];
  private sequence = 0;

  public async create(input: CreateReviewInput): Promise<ReviewRecord> {
    const existing = await this.findByRideAndAuthor(
      input.rideId,
      input.authorId,
    );

    if (existing !== null) throw new AlreadyRatedError();

    const record = {
      id: `review_${++this.sequence}`,
      rideId: input.rideId,
      authorId: input.authorId,
      targetId: input.targetId,
      rating: input.rating,
      comment: input.comment ?? null,
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    };

    this.rows.push(record);
    return record;
  }

  public async findByRideAndAuthor(
    rideId: string,
    authorId: string,
  ): Promise<ReviewRecord | null> {
    return (
      this.rows.find(
        (row) => row.rideId === rideId && row.authorId === authorId,
      ) ?? null
    );
  }
}
