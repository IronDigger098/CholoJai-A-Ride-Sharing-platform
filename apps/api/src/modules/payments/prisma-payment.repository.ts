import { type PaymentMethod, type PaymentStatus } from '@cholojai/shared';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreatePaymentInput,
  type PaymentRecord,
  type PaymentRepository,
} from './payment-repository.port';

/** Shape of the row this adapter reads. */
interface PaymentRow {
  id: string;
  rideId: string;
  payerId: string;
  method: string;
  status: string;
  amountPaisa: number;
  providerRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** PostgreSQL adapter for {@link PaymentRepository}. */
@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreatePaymentInput): Promise<PaymentRecord> {
    const row: PaymentRow = await this.prisma.payment.create({
      data: {
        rideId: input.rideId,
        payerId: input.payerId,
        method: input.method,
        status: input.status,
        amountPaisa: input.amountPaisa,
        providerRef: input.providerRef ?? null,
      },
    });

    return toRecord(row);
  }

  public async findByRideId(rideId: string): Promise<PaymentRecord | null> {
    const row: PaymentRow | null = await this.prisma.payment.findUnique({
      where: { rideId },
    });

    return row === null ? null : toRecord(row);
  }

  /**
   * Conditional update: the expected status travels in the WHERE clause.
   *
   * `updateMany` rather than `update`, because `update` throws when nothing
   * matches and "somebody else moved this first" is an answer rather than
   * an error. Two writers racing — a capture and a cancellation arriving
   * together — resolve to exactly one winner, and the loser is told.
   */
  public async transition(input: {
    readonly rideId: string;
    readonly from: PaymentStatus;
    readonly to: PaymentStatus;
    readonly providerRef?: string | undefined;
  }): Promise<boolean> {
    const changed = await this.prisma.payment.updateMany({
      where: { rideId: input.rideId, status: input.from },
      data: {
        status: input.to,
        ...(input.providerRef === undefined
          ? {}
          : { providerRef: input.providerRef }),
      },
    });

    return changed.count > 0;
  }
}

function toRecord(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    rideId: row.rideId,
    payerId: row.payerId,
    method: row.method as PaymentMethod,
    status: row.status as PaymentStatus,
    amountPaisa: row.amountPaisa,
    providerRef: row.providerRef,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
