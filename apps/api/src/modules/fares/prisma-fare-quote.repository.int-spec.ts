import { type FareOption, VEHICLE_TYPE_ORDER } from '@cholojai/shared';
import { beforeEach, expect, it } from '@jest/globals';

import {
  describeWithDatabase,
  useTestDatabase,
} from '../../testing/integration-database';

import { type CreateFareQuoteInput } from './fare-quote-repository.port';
import { PrismaFareQuoteRepository } from './prisma-fare-quote.repository';

const OPTIONS: FareOption[] = VEHICLE_TYPE_ORDER.map((vehicleType, index) => ({
  vehicleType,
  breakdown: {
    base: 5000 + index * 1000,
    distance: 12_600,
    time: 880,
    discount: 0,
    total: 18_480 + index * 1000,
  },
}));

describeWithDatabase('PrismaFareQuoteRepository (real database)', () => {
  const database = useTestDatabase();
  let repository: PrismaFareQuoteRepository;

  beforeEach(() => {
    repository = new PrismaFareQuoteRepository(database());
  });

  const input = (
    expiresAt = new Date(Date.now() + 300_000),
  ): CreateFareQuoteInput => ({
    pickup: { lat: 23.7461, lng: 90.376 },
    pickupAddress: 'Dhanmondi 27',
    dropoff: { lat: 23.7936, lng: 90.4043 },
    dropoffAddress: 'Banani 11',
    distanceMetres: 8400,
    durationSeconds: 660,
    options: OPTIONS,
    expiresAt,
  });

  it('round-trips the priced options through jsonb', async () => {
    /* `options` is the one column PostgreSQL does not type for us. This is
       the only test that proves what goes in comes back out — the unit
       suite uses an in-memory map that never serialises anything. */
    const created = await repository.create(input());

    const found = await repository.findById(created.id);

    expect(found?.options).toEqual(OPTIONS);
  });

  it('round-trips coordinates through the Decimal columns', async () => {
    /* Stored as Decimal(9,6) and read back as a Decimal object, which is
       not a number and does not compare like one. The adapter converts;
       this is what proves the conversion survives six decimal places. */
    const created = await repository.create(input());

    const found = await repository.findById(created.id);

    expect(found?.pickup).toEqual({ lat: 23.7461, lng: 90.376 });
    expect(found?.dropoff).toEqual({ lat: 23.7936, lng: 90.4043 });
  });

  it('returns an expired quote rather than hiding it', async () => {
    /* The behaviour booking depends on. If this filtered by expiry, a rider
       whose quote ran out would be told it never existed, and the client
       would have no way to know it should simply re-quote. */
    const created = await repository.create(input(new Date(Date.now() - 1000)));

    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('returns null for an id that was never issued', async () => {
    expect(await repository.findById('quote_nope')).toBeNull();
  });

  it('treats unreadable options as an absent quote', async () => {
    /* Written by an older version of this code, or by hand. A quote whose
       prices cannot be validated must never become a ride's fare snapshot;
       the rider re-quoting costs one cached routing call. */
    const created = await repository.create(input());

    await database().fareQuote.update({
      where: { id: created.id },
      data: { options: [{ vehicleType: 'HOVERCRAFT' }] },
    });

    expect(await repository.findById(created.id)).toBeNull();
  });
});
