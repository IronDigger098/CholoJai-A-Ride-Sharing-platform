/**
 * What the payments feature needs from a payment processor.
 *
 * Two verbs, because there are two moments: `authorise` reserves money when
 * a ride is booked, `capture` takes it when the ride completes, and `void`
 * releases a reservation for a ride that never happened. Every real
 * processor has this shape; modelling it now is what makes M12's real
 * adapter a swap rather than a redesign.
 *
 * Nothing here throws for a declined card. A decline is an answer, not a
 * failure — the caller must handle it either way, and a thrown decline is an
 * answer that is easy to forget to catch. Transport failures *do* throw,
 * because "the processor did not respond" is genuinely different from "the
 * processor said no", and a caller that treats them alike will either
 * double-charge or silently drop a payment.
 */

export interface AuthoriseInput {
  /** Idempotency key. The ride id, because one ride is one payment. */
  readonly reference: string;
  readonly amountPaisa: number;
  readonly payerId: string;
}

export type AuthoriseResult =
  | { readonly outcome: 'authorised'; readonly providerRef: string }
  | { readonly outcome: 'declined'; readonly reason: string };

export type CaptureResult =
  | { readonly outcome: 'captured' }
  /** Rare but real: an authorisation that expired before capture. */
  | { readonly outcome: 'expired'; readonly reason: string };

export interface PaymentGateway {
  /**
   * Reserve the fare. Idempotent on `reference`: authorising the same ride
   * twice returns the first result rather than reserving twice.
   */
  authorise(input: AuthoriseInput): Promise<AuthoriseResult>;

  /** Take a previously authorised amount. */
  capture(providerRef: string): Promise<CaptureResult>;

  /**
   * Release an authorisation nobody will capture.
   *
   * Returns nothing and swallows an unknown reference: a void is a request
   * to end up in a state, and a reference the processor has already
   * forgotten is that state.
   */
  void(providerRef: string): Promise<void>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
