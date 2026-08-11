'use client';

import {
  formatTaka,
  type Paisa,
  PAYMENT_METHOD_LABEL,
  PaymentStatus,
} from '@cholojai/shared';
import { useQuery } from '@tanstack/react-query';

import { getRidePayment } from '../api';

import type { ReactNode } from 'react';

/**
 * What was paid, how, and whether it went through.
 *
 * Its own query rather than a field on the ride, because it changes on a
 * different clock: the ride is finished the moment the driver says so, and
 * the capture settles after. Folding it in would mean every poll of a moving
 * ride re-read a row that changes twice in its life.
 *
 * Rendered with decimals for the same reason the fare breakdown is — a
 * receipt that rounds is a receipt somebody will add up and dispute.
 */
const EXACT = { withDecimals: true } as const;

/** What each status means to the person who paid, not to the gateway. */
const STATUS_NOTE: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Held until the ride finishes.',
  [PaymentStatus.SUCCEEDED]: 'Paid.',
  [PaymentStatus.FAILED]:
    'This payment did not go through. We will be in touch.',
  [PaymentStatus.CANCELLED]: 'Released — the ride was cancelled.',
};

export function RidePayment({ rideId }: { rideId: string }): ReactNode {
  /* Errors are swallowed on purpose. A ride booked before payments existed
     has none, and the endpoint answers 404 — which is a fact about history
     rather than something to alarm a rider about on their own receipt. */
  const { data: payment } = useQuery({
    queryKey: ['ride-payment', rideId],
    queryFn: () => getRidePayment(rideId),
    retry: false,
  });

  if (payment === undefined) return null;

  const failed = payment.status === PaymentStatus.FAILED;

  return (
    <div className="border-border-strong mt-6 rounded-md border px-4 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">
          {PAYMENT_METHOD_LABEL[payment.method]}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {formatTaka(payment.amountPaisa as Paisa, EXACT)}
        </span>
      </div>

      <p
        className={`mt-1 text-xs ${failed ? 'text-danger' : 'text-content-subtle'}`}
        {...(failed ? { role: 'alert' as const } : {})}
      >
        {STATUS_NOTE[payment.status]}
      </p>

      {/* The only string a rider can quote to support about a charge.
          Hiding it makes "which payment?" a database question. */}
      {payment.providerRef !== null && (
        <p className="text-content-subtle mt-1 font-mono text-xs break-all">
          {payment.providerRef}
        </p>
      )}
    </div>
  );
}
