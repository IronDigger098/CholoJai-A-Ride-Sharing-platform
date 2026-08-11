import { PaymentMethod, PaymentStatus } from '@cholojai/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { InMemoryPaymentRepository } from '../../testing/in-memory-payment.repository';

import { MockPaymentGateway } from './mock-payment.gateway';
import { type PaymentGateway } from './payment-gateway.port';
import { PaymentDeclinedError } from './payments.errors';
import { PaymentsService } from './payments.service';

const RIDE = 'ride_1';
const RIDER = 'user_rider_1';

/** A fare that the mock gateway is happy with. */
const FARE = 18_480;

/** Ends in 13 paisa: the mock gateway's deterministic decline. */
const DECLINED_FARE = 18_413;

/** Ends in 17 paisa: authorises, then expires before capture. */
const EXPIRING_FARE = 18_417;

describe('PaymentsService', () => {
  let payments: InMemoryPaymentRepository;
  let service: PaymentsService;

  beforeEach(() => {
    payments = new InMemoryPaymentRepository();
    service = new PaymentsService(payments, new MockPaymentGateway());
  });

  /** Reserve and attach — what booking does either side of creating a ride. */
  async function authorise(
    method: PaymentMethod,
    amountPaisa = FARE,
  ): Promise<unknown> {
    const authorisation = await service.authorise({
      reference: 'quote_1',
      payerId: RIDER,
      method,
      amountPaisa,
    });

    return service.record(RIDE, RIDER, authorisation);
  }

  async function statusOf(rideId = RIDE): Promise<PaymentStatus | undefined> {
    return (await payments.findByRideId(rideId))?.status;
  }

  describe('authorise', () => {
    it('reserves the fare for a card', async () => {
      const payment = await authorise(PaymentMethod.MOCK_CARD);

      expect(payment).toMatchObject({
        status: PaymentStatus.PENDING,
        amountPaisa: FARE,
      });
      expect((await payments.findByRideId(RIDE))?.providerRef).not.toBeNull();
    });

    it('records cash without asking a gateway', async () => {
      /* There is nothing to reserve and nobody to ask. The row exists so
         that "what is owed on this ride" has one answer regardless of
         method. */
      const payment = await authorise(PaymentMethod.CASH);

      expect(payment).toMatchObject({ status: PaymentStatus.PENDING });
      expect((await payments.findByRideId(RIDE))?.providerRef).toBeNull();
    });

    it('refuses the booking when the card is declined', async () => {
      /* The whole reason authorisation happens at booking: a rider whose
         card will not work finds out while they are still standing on the
         pavement, not after being driven across Dhaka. */
      await expect(
        authorise(PaymentMethod.MOCK_CARD, DECLINED_FARE),
      ).rejects.toThrow(PaymentDeclinedError);
    });

    it('stores nothing when the card is declined', async () => {
      /* A payment row for a ride that was never created would reference a
         row that does not exist — the FK would refuse it anyway. */
      await expect(
        authorise(PaymentMethod.MOCK_CARD, DECLINED_FARE),
      ).rejects.toThrow(PaymentDeclinedError);

      expect(payments.rows).toHaveLength(0);
    });

    it('suggests cash in the decline message', async () => {
      /* A decline that only says "declined" leaves the rider with nothing
         to do. They can always pay the driver. */
      await expect(
        authorise(PaymentMethod.MOCK_CARD, DECLINED_FARE),
      ).rejects.toThrow(/cash/iu);
    });

    it('reserves without writing a row, because the ride does not exist yet', async () => {
      /* `payments.ride_id` is a foreign key. The reservation has to come
         first — a declined card must leave no ride behind — so nothing can
         be stored until the ride is created. */
      await service.authorise({
        reference: 'quote_1',
        payerId: RIDER,
        method: PaymentMethod.MOCK_CARD,
        amountPaisa: FARE,
      });

      expect(payments.rows).toHaveLength(0);
    });
  });

  describe('release', () => {
    it('gives back a reservation whose ride was never created', async () => {
      /* The window is small but real: the rider already had an active ride,
         or the quote expired between reserving and inserting. Without this
         they hold a charge for a journey that does not exist. */
      const authorisation = await service.authorise({
        reference: 'quote_1',
        payerId: RIDER,
        method: PaymentMethod.MOCK_CARD,
        amountPaisa: FARE,
      });

      await expect(service.release(authorisation)).resolves.toBeUndefined();
      expect(payments.rows).toHaveLength(0);
    });

    it('does nothing for cash, which reserved nothing', async () => {
      const authorisation = await service.authorise({
        reference: 'quote_1',
        payerId: RIDER,
        method: PaymentMethod.CASH,
        amountPaisa: FARE,
      });

      expect(authorisation.providerRef).toBeNull();
      await expect(service.release(authorisation)).resolves.toBeUndefined();
    });

    it('swallows a gateway that refuses to release', async () => {
      /* Called from a failure path. Throwing here would replace the real
         reason the booking failed with a worse one. */
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const angry = {
        authorise: () =>
          Promise.resolve({
            outcome: 'authorised' as const,
            providerRef: 'mock_1',
          }),
        capture: () => Promise.resolve({ outcome: 'captured' as const }),
        void: () => Promise.reject(new Error('gateway unreachable')),
      } satisfies PaymentGateway;

      const fragile = new PaymentsService(payments, angry);

      await expect(
        fragile.release({
          method: PaymentMethod.MOCK_CARD,
          amountPaisa: FARE,
          providerRef: 'mock_1',
        }),
      ).resolves.toBeUndefined();

      jest.restoreAllMocks();
    });
  });

  describe('capture', () => {
    it('takes the money when the ride completes', async () => {
      await authorise(PaymentMethod.MOCK_CARD);

      await service.capture(RIDE);

      expect(await statusOf()).toBe(PaymentStatus.SUCCEEDED);
    });

    it('settles cash without a gateway round trip', async () => {
      await authorise(PaymentMethod.CASH);

      await service.capture(RIDE);

      expect(await statusOf()).toBe(PaymentStatus.SUCCEEDED);
    });

    it('records a failed capture rather than throwing', async () => {
      /* The ride is over. The rider has been driven and the driver has
         driven; no failure here can undo either. A failed capture is a debt
         to chase, not a reason to refuse to finish the journey. */
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await authorise(PaymentMethod.MOCK_CARD, EXPIRING_FARE);

      await expect(service.capture(RIDE)).resolves.toBeUndefined();

      expect(await statusOf()).toBe(PaymentStatus.FAILED);
      jest.restoreAllMocks();
    });

    it('does nothing to a payment that is no longer pending', async () => {
      await authorise(PaymentMethod.MOCK_CARD);
      await service.capture(RIDE);

      await service.capture(RIDE);

      expect(await statusOf()).toBe(PaymentStatus.SUCCEEDED);
    });

    it('survives a ride that has no payment at all', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(service.capture('ride_nope')).resolves.toBeUndefined();

      jest.restoreAllMocks();
    });
  });

  describe('cancel', () => {
    it('releases the reservation as CANCELLED, not FAILED', async () => {
      /* Nothing failed — it was called off. Collapsing the two would make
         "how often do cards decline?" unanswerable from the data. */
      await authorise(PaymentMethod.MOCK_CARD);

      await service.cancel(RIDE);

      expect(await statusOf()).toBe(PaymentStatus.CANCELLED);
    });

    it('cancels a cash payment too', async () => {
      await authorise(PaymentMethod.CASH);

      await service.cancel(RIDE);

      expect(await statusOf()).toBe(PaymentStatus.CANCELLED);
    });

    it('leaves a captured payment alone', async () => {
      /* The race worth caring about: a driver completing a ride at the
         moment the rider cancels it. The expected status in the WHERE
         clause means the later write finds nothing to move. */
      await authorise(PaymentMethod.MOCK_CARD);
      await service.capture(RIDE);

      await service.cancel(RIDE);

      expect(await statusOf()).toBe(PaymentStatus.SUCCEEDED);
    });

    it('does not fail a cancellation when the void throws', async () => {
      /* The reservation sits until the processor expires it, costing the
         rider a temporary hold. Refusing to cancel the ride over that would
         trap them in a journey they called off. */
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const angry = {
        authorise: () =>
          Promise.resolve({
            outcome: 'authorised' as const,
            providerRef: 'mock_1',
          }),
        capture: () => Promise.resolve({ outcome: 'captured' as const }),
        void: () => Promise.reject(new Error('gateway unreachable')),
      } satisfies PaymentGateway;

      const fragile = new PaymentsService(payments, angry);
      const authorisation = await fragile.authorise({
        reference: 'quote_1',
        payerId: RIDER,
        method: PaymentMethod.MOCK_CARD,
        amountPaisa: FARE,
      });
      await fragile.record(RIDE, RIDER, authorisation);

      await expect(fragile.cancel(RIDE)).resolves.toBeUndefined();

      expect(await statusOf()).toBe(PaymentStatus.CANCELLED);
      jest.restoreAllMocks();
    });
  });
});
