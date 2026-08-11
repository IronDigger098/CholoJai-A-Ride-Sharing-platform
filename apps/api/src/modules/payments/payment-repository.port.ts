import { type PaymentMethod, type PaymentStatus } from '@cholojai/shared';

/** What the payments feature needs from persistence. */

export interface PaymentRecord {
  readonly id: string;
  readonly rideId: string;
  readonly payerId: string;
  readonly method: PaymentMethod;
  readonly status: PaymentStatus;
  readonly amountPaisa: number;
  readonly providerRef: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreatePaymentInput {
  readonly rideId: string;
  readonly payerId: string;
  readonly method: PaymentMethod;
  readonly status: PaymentStatus;
  readonly amountPaisa: number;
  readonly providerRef?: string | undefined;
}

export interface PaymentRepository {
  create(input: CreatePaymentInput): Promise<PaymentRecord>;

  findByRideId(rideId: string): Promise<PaymentRecord | null>;

  /**
   * Move a payment to a new status, but only from the one expected.
   *
   * `from` is not decoration. Capture and cancellation can race — a driver
   * completing a ride at the moment a rider cancels it — and a blind write
   * would let the later one overwrite the earlier, turning a captured
   * payment back into a cancelled one. Carrying the expected status in the
   * WHERE clause means exactly one of the two writes lands, the same
   * pattern the ride state machine uses (database-erd.md N2).
   *
   * Returns false when nothing moved.
   */
  transition(input: {
    readonly rideId: string;
    readonly from: PaymentStatus;
    readonly to: PaymentStatus;
    readonly providerRef?: string | undefined;
  }): Promise<boolean>;
}

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
