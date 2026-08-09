import { type Coordinates, type FareOption } from '@cholojai/shared';

/**
 * What the fares module needs from storage.
 *
 * A port, so `FaresService` can be unit tested without a database. The
 * pricing rules and the expiry arithmetic are the parts worth testing, and
 * neither needs PostgreSQL to be running to be wrong.
 */

export interface CreateFareQuoteInput {
  readonly pickup: Coordinates;
  readonly pickupAddress: string;
  readonly dropoff: Coordinates;
  readonly dropoffAddress: string;
  readonly distanceMetres: number;
  readonly durationSeconds: number;
  readonly options: readonly FareOption[];
  readonly expiresAt: Date;
}

export interface FareQuoteRecord extends CreateFareQuoteInput {
  readonly id: string;
}

export interface FareQuoteRepository {
  create(input: CreateFareQuoteInput): Promise<FareQuoteRecord>;

  /**
   * Read a quote back, expired or not.
   *
   * Expiry is deliberately not filtered here. Booking needs to tell "no such
   * quote" from "that quote has expired" so it can return 404 and 422
   * respectively — a repository that hides expired rows would collapse both
   * into the same answer and the rider would be told their quote never
   * existed. M5.4 is the caller that needs this.
   */
  findById(id: string): Promise<FareQuoteRecord | null>;
}

export const FARE_QUOTE_REPOSITORY = Symbol('FARE_QUOTE_REPOSITORY');
