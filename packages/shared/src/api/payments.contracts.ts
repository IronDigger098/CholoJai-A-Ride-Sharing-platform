import { z } from 'zod';

/**
 * Payments — `docs/roadmap.md` M10a.
 *
 * A payment is authorised when a ride is booked and captured when it
 * completes. Two moments rather than one, because a card that will be
 * declined should be declined *before* the rider is driven anywhere — a
 * single charge at the end means the failure arrives when the journey is
 * already over and the only remaining options are bad ones.
 *
 * The amount comes from the ride's fare snapshot and is never recomputed
 * (domain-model D2). A payment that disagrees with the receipt is worse than
 * no payment record at all.
 */

export const PaymentMethod = {
  /** Settled with the driver. Nothing is authorised; there is nothing to decline. */
  CASH: 'CASH',
  MOCK_CARD: 'MOCK_CARD',
  MOCK_WALLET: 'MOCK_WALLET',
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  /** Authorised, or awaiting cash. Not yet money. */
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  /** The ride was cancelled before capture. Distinct from FAILED (N10). */
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** Methods that go through the gateway. Cash is settled between people. */
export const DIGITAL_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.MOCK_CARD,
  PaymentMethod.MOCK_WALLET,
];

export function isDigital(method: PaymentMethod): boolean {
  return DIGITAL_METHODS.includes(method);
}

/**
 * A payment, as the payer sees it.
 *
 * `providerRef` is included deliberately: it is the only thing a rider can
 * quote to support when a charge is disputed, and hiding it means the
 * answer to "which payment?" is a database query rather than a screenshot.
 */
export const paymentSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  method: z.nativeEnum(PaymentMethod),
  status: z.nativeEnum(PaymentStatus),
  amountPaisa: z.number().int().nonnegative(),
  providerRef: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Payment = z.infer<typeof paymentSchema>;

/**
 * What booking says about how the ride will be paid for.
 *
 * Part of the booking request rather than a separate call: a ride with no
 * decided payment method is a state the product has no answer for, and
 * making it representable means writing code to handle it forever.
 */
export const paymentMethodRequestSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
});

export type PaymentMethodRequest = z.infer<typeof paymentMethodRequestSchema>;

/** Human-readable labels, so the web app and any future client agree. */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Cash',
  [PaymentMethod.MOCK_CARD]: 'Card',
  [PaymentMethod.MOCK_WALLET]: 'Wallet',
};

/** Cheapest first is meaningless here; this is the order riders expect. */
export const PAYMENT_METHOD_ORDER: readonly PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.MOCK_CARD,
  PaymentMethod.MOCK_WALLET,
];
