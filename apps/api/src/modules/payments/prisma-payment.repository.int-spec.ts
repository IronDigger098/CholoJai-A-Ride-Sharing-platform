import {
  type FareOption,
  PaymentMethod,
  PaymentStatus,
  RideStatus,
  VehicleType,
  VEHICLE_TYPE_ORDER,
} from '@cholojai/shared';
/* No `describe` — this suite is wrapped in `describeWithDatabase`, which is
   `describe.skip` unless DATABASE_TEST_URL is set. */
import { beforeEach, expect, it } from '@jest/globals';

import {
  describeWithDatabase,
  useTestDatabase,
} from '../../testing/integration-database';

import { PrismaPaymentRepository } from './prisma-payment.repository';

/**
 * The capture/cancel race, against a real database.
 *
 * `transition` carries the expected status in its WHERE clause so that two
 * writers arriving together resolve to one winner. The race is not
 * hypothetical: a driver pressing "complete" at the moment a rider presses
 * "cancel" is a normal Tuesday, and the two paths write different statuses
 * to the same row.
 *
 * The in-memory fake reproduces the `from` check, but it is single-threaded
 * — it cannot show two transactions contending. Getting this wrong turns a
 * captured payment back into a cancelled one, which is money taken and then
 * recorded as never taken.
 */

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

describeWithDatabase('PrismaPaymentRepository (real database)', () => {
  const database = useTestDatabase();
  let repository: PrismaPaymentRepository;

  beforeEach(() => {
    repository = new PrismaPaymentRepository(database());
  });

  async function createRider(): Promise<string> {
    const user = await database().user.create({
      data: {
        email: 'rider@cholojai.test',
        fullName: 'Test Rider',
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
      },
    });

    return user.id;
  }

  async function createRide(riderId: string): Promise<string> {
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

    const ride = await database().ride.create({
      data: {
        riderId,
        fareQuoteId: quote.id,
        status: RideStatus.REQUESTED,
        vehicleType: VehicleType.CNG,
        pickupLat: 23.7461,
        pickupLng: 90.376,
        pickupAddress: 'Dhanmondi 27',
        dropoffLat: 23.7936,
        dropoffLng: 90.4043,
        dropoffAddress: 'Banani 11',
        distanceM: 8400,
        durationS: 660,
        fareBasePaisa: FARE.base,
        fareDistancePaisa: FARE.distance,
        fareTimePaisa: FARE.time,
        fareDiscountPaisa: FARE.discount,
        fareTotalPaisa: FARE.total,
      },
    });

    return ride.id;
  }

  /** A pending card payment on a fresh ride. */
  async function pendingPayment(): Promise<string> {
    const riderId = await createRider();
    const rideId = await createRide(riderId);

    await repository.create({
      rideId,
      payerId: riderId,
      method: PaymentMethod.MOCK_CARD,
      status: PaymentStatus.PENDING,
      amountPaisa: FARE.total,
      providerRef: 'mock_ref_1',
    });

    return rideId;
  }

  async function statusOf(rideId: string): Promise<PaymentStatus | undefined> {
    return (await repository.findByRideId(rideId))?.status;
  }

  it('stores a payment against its ride', async () => {
    const rideId = await pendingPayment();

    const payment = await repository.findByRideId(rideId);

    expect(payment).toMatchObject({
      status: PaymentStatus.PENDING,
      amountPaisa: FARE.total,
      providerRef: 'mock_ref_1',
    });
  });

  it('moves a pending payment to succeeded', async () => {
    const rideId = await pendingPayment();

    const moved = await repository.transition({
      rideId,
      from: PaymentStatus.PENDING,
      to: PaymentStatus.SUCCEEDED,
    });

    expect(moved).toBe(true);
    expect(await statusOf(rideId)).toBe(PaymentStatus.SUCCEEDED);
  });

  it('refuses a transition from a status the row is not in', async () => {
    /* The property the whole method exists for. Without the `from` check a
       late cancellation would overwrite a capture, and the platform would
       have taken money it then recorded as never taken. */
    const rideId = await pendingPayment();
    await repository.transition({
      rideId,
      from: PaymentStatus.PENDING,
      to: PaymentStatus.SUCCEEDED,
    });

    const late = await repository.transition({
      rideId,
      from: PaymentStatus.PENDING,
      to: PaymentStatus.CANCELLED,
    });

    expect(late).toBe(false);
    expect(await statusOf(rideId)).toBe(PaymentStatus.SUCCEEDED);
  });

  it('lets exactly one of a capture and a cancellation win', async () => {
    /* The real race: a driver completing at the moment the rider cancels.
       Both read PENDING; PostgreSQL serialises the two UPDATEs and the
       second finds a row that no longer matches its WHERE clause. */
    const rideId = await pendingPayment();

    const [captured, cancelled] = await Promise.all([
      repository.transition({
        rideId,
        from: PaymentStatus.PENDING,
        to: PaymentStatus.SUCCEEDED,
      }),
      repository.transition({
        rideId,
        from: PaymentStatus.PENDING,
        to: PaymentStatus.CANCELLED,
      }),
    ]);

    expect([captured, cancelled].filter(Boolean)).toHaveLength(1);

    const final = await statusOf(rideId);
    expect([PaymentStatus.SUCCEEDED, PaymentStatus.CANCELLED]).toContain(final);
  });

  it('settles on one status however many writers race', async () => {
    /* Two can pass by luck. Six cannot: any missing predicate shows up as
       more than one successful transition. */
    const rideId = await pendingPayment();

    const results = await Promise.all(
      [
        PaymentStatus.SUCCEEDED,
        PaymentStatus.CANCELLED,
        PaymentStatus.FAILED,
        PaymentStatus.SUCCEEDED,
        PaymentStatus.CANCELLED,
        PaymentStatus.FAILED,
      ].map((to) =>
        repository.transition({ rideId, from: PaymentStatus.PENDING, to }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('refuses a second payment on one ride', async () => {
    /* `ride_id` is unique. One ride is one payment — the fare snapshot has
       a single total, so two payments could not both be right. */
    const rideId = await pendingPayment();
    const payment = await repository.findByRideId(rideId);

    await expect(
      repository.create({
        rideId,
        payerId: payment?.payerId ?? '',
        method: PaymentMethod.CASH,
        status: PaymentStatus.PENDING,
        amountPaisa: FARE.total,
      }),
    ).rejects.toThrow();
  });

  it('records a provider reference when one is supplied on transition', async () => {
    const rideId = await pendingPayment();

    await repository.transition({
      rideId,
      from: PaymentStatus.PENDING,
      to: PaymentStatus.SUCCEEDED,
      providerRef: 'mock_ref_2',
    });

    expect((await repository.findByRideId(rideId))?.providerRef).toBe(
      'mock_ref_2',
    );
  });
});
