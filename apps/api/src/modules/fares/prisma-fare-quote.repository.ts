import { fareOptionSchema } from '@cholojai/shared';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateFareQuoteInput,
  type FareQuoteRecord,
  type FareQuoteRepository,
} from './fare-quote-repository.port';

/**
 * PostgreSQL adapter for {@link FareQuoteRepository}.
 *
 * `options` is a `Json` column — the one place in this schema that is not
 * typed by the database. Reading it back therefore goes through the same Zod
 * schema the API responds with, because Prisma types `Json` as `JsonValue`
 * and casting would let a row written by an older version of this code reach
 * the fare snapshot unchecked.
 */
const optionsSchema = z.array(fareOptionSchema).min(1);

/** Shape of the row this adapter reads. */
interface QuoteRow {
  id: string;
  pickupLat: unknown;
  pickupLng: unknown;
  pickupAddress: string;
  dropoffLat: unknown;
  dropoffLng: unknown;
  dropoffAddress: string;
  distanceM: number;
  durationS: number;
  options: unknown;
  expiresAt: Date;
}

@Injectable()
export class PrismaFareQuoteRepository implements FareQuoteRepository {
  private readonly logger = new Logger(PrismaFareQuoteRepository.name);

  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateFareQuoteInput): Promise<FareQuoteRecord> {
    const row: QuoteRow = await this.prisma.fareQuote.create({
      data: {
        pickupLat: input.pickup.lat,
        pickupLng: input.pickup.lng,
        pickupAddress: input.pickupAddress,
        dropoffLat: input.dropoff.lat,
        dropoffLng: input.dropoff.lng,
        dropoffAddress: input.dropoffAddress,
        distanceM: input.distanceMetres,
        durationS: input.durationSeconds,
        /* `options` is the one column PostgreSQL does not type for us. No
           cast is needed on the way in — Prisma's JSON input type already
           accepts this shape — and everything read back out of it goes
           through `optionsSchema` before anything prices from it. */
        options: input.options,
        expiresAt: input.expiresAt,
      },
    });

    /* The row was just written from `input`, so returning the input with the
       generated id avoids re-parsing the JSON we serialised a line ago. */
    return { ...input, id: row.id };
  }

  public async findById(id: string): Promise<FareQuoteRecord | null> {
    const row: QuoteRow | null = await this.prisma.fareQuote.findUnique({
      where: { id },
    });

    if (row === null) return null;

    const options = optionsSchema.safeParse(row.options);

    if (!options.success) {
      /* Written by an older version of this code, or by hand. Treated as
         absent rather than repaired: a quote whose prices cannot be
         validated must never become a ride's fare snapshot, and the rider
         re-quoting costs one routing call. */
      this.logger.warn(`Fare quote ${id} has unreadable options; ignoring`);
      return null;
    }

    return {
      id: row.id,
      pickup: { lat: toNumber(row.pickupLat), lng: toNumber(row.pickupLng) },
      pickupAddress: row.pickupAddress,
      dropoff: { lat: toNumber(row.dropoffLat), lng: toNumber(row.dropoffLng) },
      dropoffAddress: row.dropoffAddress,
      distanceMetres: row.distanceM,
      durationSeconds: row.durationS,
      options: options.data,
      expiresAt: row.expiresAt,
    };
  }
}

/**
 * Prisma returns `Decimal` for the coordinate columns.
 *
 * `Decimal` exists to keep money exact; for a latitude at six decimal places
 * a float is exact enough and is what every consumer wants. Converting here
 * rather than leaking the driver's type past the repository boundary.
 */
function toNumber(value: unknown): number {
  return Number(value);
}
