import { type PaymentStatus } from '@cholojai/shared';

import {
  type CreatePaymentInput,
  type PaymentRecord,
  type PaymentRepository,
} from '../modules/payments/payment-repository.port';

/**
 * In-memory {@link PaymentRepository}.
 *
 * `transition` reproduces the conditional update rather than writing
 * blindly: the `from` check is the behaviour the service depends on, and a
 * fake that ignored it would let tests pass against a service that
 * overwrites a captured payment with a cancelled one.
 *
 * What it cannot reproduce is two writers arriving at once — that needs a
 * real database, and `prisma-payment.repository.int-spec.ts` is where it is
 * demonstrated.
 */
export class InMemoryPaymentRepository implements PaymentRepository {
  public readonly rows: PaymentRecord[] = [];
  private sequence = 0;

  public async create(input: CreatePaymentInput): Promise<PaymentRecord> {
    this.sequence += 1;

    const now = new Date();
    const record: PaymentRecord = {
      id: `payment_${this.sequence}`,
      rideId: input.rideId,
      payerId: input.payerId,
      method: input.method,
      status: input.status,
      amountPaisa: input.amountPaisa,
      providerRef: input.providerRef ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.rows.push(record);

    return record;
  }

  public async findByRideId(rideId: string): Promise<PaymentRecord | null> {
    return this.rows.find((row) => row.rideId === rideId) ?? null;
  }

  public async transition(input: {
    readonly rideId: string;
    readonly from: PaymentStatus;
    readonly to: PaymentStatus;
    readonly providerRef?: string | undefined;
  }): Promise<boolean> {
    const index = this.rows.findIndex(
      (row) => row.rideId === input.rideId && row.status === input.from,
    );

    if (index === -1) return false;

    const existing = this.rows[index];

    if (existing === undefined) return false;

    this.rows[index] = {
      ...existing,
      status: input.to,
      ...(input.providerRef === undefined
        ? {}
        : { providerRef: input.providerRef }),
      updatedAt: new Date(),
    };

    return true;
  }
}
