import {
  isDigital,
  type Payment,
  type PaymentMethod,
  PaymentStatus,
} from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-gateway.port';
import {
  PAYMENT_REPOSITORY,
  type PaymentRecord,
  type PaymentRepository,
} from './payment-repository.port';
import { PaymentDeclinedError } from './payments.errors';

/**
 * A reservation that has not been attached to a ride yet.
 *
 * `providerRef` is null for cash — nothing was reserved. Carrying the
 * amount means the row written later cannot disagree with the amount that
 * was actually authorised, which is the one number a dispute turns on.
 */
export interface Authorisation {
  readonly method: PaymentMethod;
  readonly amountPaisa: number;
  readonly providerRef: string | null;
}

/**
 * The money side of a ride.
 *
 * Three moments, matching the ride's own life: authorise when it is booked,
 * capture when it completes, cancel when it does not happen. Cash skips the
 * gateway entirely and simply records what is owed — there is nothing to
 * reserve and nobody to ask.
 *
 * The amount always comes from the caller, which always takes it from the
 * ride's fare snapshot (D2). This service never prices anything. A payment
 * that disagrees with the receipt is a support ticket that cannot be
 * answered, so there is exactly one place the number can come from.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  public constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /**
   * Reserve the fare for a ride that does not exist yet.
   *
   * Deliberately writes nothing. `payments.ride_id` is a foreign key, so a
   * row cannot precede its ride — and the ride must not precede a successful
   * authorisation, because a declined card should leave no ride behind at
   * all. So the money is reserved first, the ride is created second, and
   * {@link record} joins them.
   *
   * Throws `PaymentDeclinedError` when the gateway refuses, which fails the
   * booking before it starts. That is the point of authorising here rather
   * than at completion: a rider whose card will not work finds out while
   * they are still standing on the pavement, when switching to cash costs
   * them a tap. The alternative tells them after they have been driven
   * somewhere.
   */
  public async authorise(input: {
    /** Idempotency key. The quote id: one quote becomes at most one ride. */
    readonly reference: string;
    readonly payerId: string;
    readonly method: PaymentMethod;
    readonly amountPaisa: number;
  }): Promise<Authorisation> {
    /* Cash reserves nothing, because there is nothing to reserve and nobody
       to ask. It still returns an authorisation so the caller has one shape
       to handle rather than two. */
    if (!isDigital(input.method)) {
      return {
        method: input.method,
        amountPaisa: input.amountPaisa,
        providerRef: null,
      };
    }

    const result = await this.gateway.authorise({
      reference: input.reference,
      amountPaisa: input.amountPaisa,
      payerId: input.payerId,
    });

    if (result.outcome === 'declined') {
      throw new PaymentDeclinedError(result.reason);
    }

    return {
      method: input.method,
      amountPaisa: input.amountPaisa,
      providerRef: result.providerRef,
    };
  }

  /**
   * Attach a reservation to the ride it paid for.
   *
   * Separate from {@link authorise} only because of ordering: by here the
   * ride exists, so the row can too. The amount is the one that was
   * authorised, not a fresh reading of anything.
   */
  public async record(
    rideId: string,
    payerId: string,
    authorisation: Authorisation,
  ): Promise<Payment> {
    return toPayment(
      await this.payments.create({
        rideId,
        payerId,
        method: authorisation.method,
        status: PaymentStatus.PENDING,
        amountPaisa: authorisation.amountPaisa,
        ...(authorisation.providerRef === null
          ? {}
          : { providerRef: authorisation.providerRef }),
      }),
    );
  }

  /**
   * Give back a reservation whose ride was never created.
   *
   * The window is small but real: the rider already had an active ride, or
   * the quote expired between the authorisation and the insert. Without
   * this the rider keeps a hold on their card for a journey that does not
   * exist, and has no way to explain it.
   *
   * Never throws. It is called from a failure path, and an exception here
   * would replace the real reason the booking failed with a worse one.
   */
  public async release(authorisation: Authorisation): Promise<void> {
    if (authorisation.providerRef === null) return;

    try {
      await this.gateway.void(authorisation.providerRef);
    } catch (cause) {
      this.logger.warn(
        `Could not release ${authorisation.providerRef}: ${describe(cause)}`,
      );
    }
  }

  /**
   * Take the money for a ride that has just finished.
   *
   * Never throws. The ride is complete — the rider has been driven, the
   * driver has driven — and no failure here can undo that. A capture that
   * fails is a debt to chase, recorded as `FAILED`, not a reason to refuse
   * to finish a journey that is already over.
   */
  public async capture(rideId: string): Promise<void> {
    const payment = await this.payments.findByRideId(rideId);

    if (payment === null) {
      this.logger.warn(`Ride ${rideId} completed with no payment row`);
      return;
    }

    if (payment.status !== PaymentStatus.PENDING) return;

    if (payment.providerRef === null) {
      /* Cash: the driver has been handed the money, or has not. Either way
         the platform's record is that the fare is settled — chasing cash is
         not something this system can do. */
      await this.payments.transition({
        rideId,
        from: PaymentStatus.PENDING,
        to: PaymentStatus.SUCCEEDED,
      });
      return;
    }

    const result = await this.gateway.capture(payment.providerRef);

    await this.payments.transition({
      rideId,
      from: PaymentStatus.PENDING,
      to:
        result.outcome === 'captured'
          ? PaymentStatus.SUCCEEDED
          : PaymentStatus.FAILED,
    });

    if (result.outcome !== 'captured') {
      this.logger.warn(`Capture failed for ride ${rideId}: ${result.reason}`);
    }
  }

  /**
   * Release the reservation for a ride that will not happen.
   *
   * `CANCELLED` rather than `FAILED`, because nothing failed. Collapsing
   * the two would make "how often are cards declined?" unanswerable from
   * the data, which is the first question anyone asks of a payments table.
   *
   * Never throws, for the same reason `capture` does not: the ride is
   * already cancelled by the time this runs, and refusing to cancel a ride
   * because a reservation could not be released would trap the rider in a
   * journey they have called off.
   */
  public async cancel(rideId: string): Promise<void> {
    const payment = await this.payments.findByRideId(rideId);

    if (payment?.status !== PaymentStatus.PENDING) return;

    if (payment.providerRef !== null) {
      try {
        await this.gateway.void(payment.providerRef);
      } catch (cause) {
        /* The reservation may sit until the processor expires it, which
           costs the rider a temporary hold and nothing else. Worth a log,
           not worth failing the cancellation. */
        this.logger.warn(
          `Could not void ${payment.providerRef}: ${describe(cause)}`,
        );
      }
    }

    await this.payments.transition({
      rideId,
      from: PaymentStatus.PENDING,
      to: PaymentStatus.CANCELLED,
    });
  }

  public async findForRide(rideId: string): Promise<Payment | null> {
    const payment = await this.payments.findByRideId(rideId);

    return payment === null ? null : toPayment(payment);
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function toPayment(record: PaymentRecord): Payment {
  return {
    id: record.id,
    rideId: record.rideId,
    method: record.method,
    status: record.status,
    amountPaisa: record.amountPaisa,
    providerRef: record.providerRef,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
