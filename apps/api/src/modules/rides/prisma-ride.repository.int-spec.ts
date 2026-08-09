import {
  type FareOption,
  RideStatus,
  VehicleType,
  VEHICLE_TYPE_ORDER,
} from '@cholojai/shared';
import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  describeWithDatabase,
  useTestDatabase,
} from '../../testing/integration-database';

import { PrismaRideRepository } from './prisma-ride.repository';
import { type CreateRideInput } from './ride-repository.port';
import { RiderAlreadyOnRideError } from './rides.errors';

const FARE = {
  base: 5000,
  distance: 12_600,
  time: 880,
  discount: 0,
  total: 18_480,
};

const OPTIONS: FareOption[] = VEHICLE_TYPE_ORDER.map((vehicleType) => ({
  vehicleType,
  breakdown: FARE,
}));

describeWithDatabase('PrismaRideRepository (real database)', () => {
  const database = useTestDatabase();
  let repository: PrismaRideRepository;

  beforeEach(() => {
    repository = new PrismaRideRepository(database());
  });

  async function createRider(email = 'rider@cholojai.test'): Promise<string> {
    const user = await database().user.create({
      data: {
        email,
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
        fullName: 'Test Rider',
      },
    });

    return user.id;
  }

  async function createQuote(): Promise<string> {
    const quote = await database().fareQuote.create({
      data: {
        pickupLat: 23.7461,
        pickupLng: 90.376,
        pickupAddress: 'Dhanmondi 27',
        dropoffLat: 23.7936,
        dropoffLng: 90.4043,
        dropoffAddress: 'Banani 11',
        distanceM: 8400,
        durationS: 660,
        options: OPTIONS,
        expiresAt: new Date(Date.now() + 300_000),
      },
    });

    return quote.id;
  }

  async function input(riderId: string): Promise<CreateRideInput> {
    return {
      riderId,
      fareQuoteId: await createQuote(),
      vehicleType: VehicleType.CNG,
      pickup: { lat: 23.7461, lng: 90.376 },
      pickupAddress: 'Dhanmondi 27',
      dropoff: { lat: 23.7936, lng: 90.4043 },
      dropoffAddress: 'Banani 11',
      distanceMetres: 8400,
      durationSeconds: 660,
      fare: FARE,
    };
  }

  it('writes a REQUESTED ride with its fare snapshot', async () => {
    const riderId = await createRider();

    const ride = await repository.create(await input(riderId));

    expect(ride.status).toBe(RideStatus.REQUESTED);
    expect(ride.fare).toEqual(FARE);
  });

  it('refuses a second active ride for the same rider', async () => {
    /* The test this whole suite exists for, and it earned its place
       immediately: the adapter originally matched `meta.target` against the
       index name, and this failed. Prisma reports the database column —
       `['rider_id']` — so the translation never fired and a rider booking a
       second ride got a raw Prisma error instead of a 409.

       No fake could have caught it. `one_active_ride_per_rider` is a partial
       unique index that Prisma's schema cannot express, so the in-memory
       repository enforces the rule with a scan and throws the right error
       for the wrong reason. */
    const riderId = await createRider();
    await repository.create(await input(riderId));

    await expect(repository.create(await input(riderId))).rejects.toThrow(
      RiderAlreadyOnRideError,
    );
  });

  it('allows a new ride once the previous one is terminal', async () => {
    /* The index is partial — it only covers non-terminal statuses. If it
       were a plain unique index on rider_id, a rider could take exactly one
       ride ever, and nothing in the unit suite would notice. */
    const riderId = await createRider();
    const first = await repository.create(await input(riderId));

    await database().ride.update({
      where: { id: first.id },
      data: { status: RideStatus.COMPLETED, completedAt: new Date() },
    });

    const second = await repository.create(await input(riderId));

    expect(second.id).not.toBe(first.id);
  });

  it('lets two different riders hold active rides at once', async () => {
    const one = await createRider('one@cholojai.test');
    const two = await createRider('two@cholojai.test');

    await repository.create(await input(one));
    await repository.create(await input(two));

    expect(await database().ride.count()).toBe(2);
  });

  it('rejects a fare snapshot whose parts do not sum to its total', async () => {
    /* CHECK (fare_total_paisa = base + distance + time - discount), N3. The
       constraint is the reason estimateFare rounds each component rather
       than the total, and this proves the database really does refuse the
       arithmetic the engine is careful to get right.

       The second assertion matters as much as the first. `rides` has two
       partial unique indexes, so an adapter that matched "some constraint
       failed" instead of the index by name would report this CHECK
       violation to the rider as "you are already on a ride" — confidently,
       and wrongly. Written as a caught value rather than
       `.rejects.not.toThrow()`, which passes vacuously if the promise
       resolves. */
    const riderId = await createRider();
    const base = await input(riderId);

    const error: unknown = await repository
      .create({ ...base, fare: { ...FARE, total: FARE.total + 1 } })
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RiderAlreadyOnRideError);
  });

  describe('findActiveForRider', () => {
    it('finds the running ride', async () => {
      const riderId = await createRider();
      const created = await repository.create(await input(riderId));

      expect((await repository.findActiveForRider(riderId))?.id).toBe(
        created.id,
      );
    });

    it('returns null once the ride is terminal', async () => {
      const riderId = await createRider();
      const created = await repository.create(await input(riderId));

      await database().ride.update({
        where: { id: created.id },
        data: { status: RideStatus.CANCELLED, cancelledAt: new Date() },
      });

      expect(await repository.findActiveForRider(riderId)).toBeNull();
    });
  });
});
