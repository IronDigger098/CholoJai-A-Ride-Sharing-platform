import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import {
  type AuthoriseInput,
  type AuthoriseResult,
  type CaptureResult,
  type PaymentGateway,
} from './payment-gateway.port';

/**
 * A payment processor that isn't one.
 *
 * It exists so the rest of the system can be built and tested against
 * realistic behaviour before a real processor is chosen. That means it must
 * decline sometimes: a gateway that always succeeds leaves the decline path
 * unwritten, and the decline path is the one that matters — it is the
 * difference between a rider being told their card failed and a rider being
 * driven across Dhaka for free.
 *
 * Declines are **deterministic**, keyed off the amount rather than random.
 * A random adapter makes a test suite that fails one run in twenty, which
 * teaches everybody to re-run rather than to read. The rule below is
 * arbitrary but stable, and it is documented where a developer will find it:
 * an amount ending in `13` paisa is declined.
 */

/** The magic remainder. Chosen to be unlikely in a real fare and easy to type. */
const DECLINE_REMAINDER = 13;

/** One more, for the authorisation that survives booking and dies later. */
const EXPIRE_REMAINDER = 17;

const HUNDRED = 100;

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(MockPaymentGateway.name);

  /**
   * Authorisations by reference.
   *
   * In-memory, which is the honest shape for a fake: the real adapter will
   * hold no state at all because the processor holds it. This map exists
   * only to make `authorise` idempotent and `capture` able to refuse a
   * reference it never issued.
   */
  private readonly authorisations = new Map<
    string,
    { providerRef: string; amountPaisa: number }
  >();

  /* Not `async`, because nothing here awaits anything — a fake has nothing
     to wait for. The port still returns promises, which is what the real
     adapter will need, so callers are written against the shape that will
     survive M12. */
  public authorise(input: AuthoriseInput): Promise<AuthoriseResult> {
    const existing = this.authorisations.get(input.reference);

    /* Idempotent on the reference. A retried booking must not reserve the
       fare twice, and the caller cannot always know whether its first
       attempt reached us. */
    if (existing !== undefined) {
      return Promise.resolve({
        outcome: 'authorised',
        providerRef: existing.providerRef,
      });
    }

    if (input.amountPaisa % HUNDRED === DECLINE_REMAINDER) {
      this.logger.log(
        `Declining ${input.reference}: amount ends in ${String(DECLINE_REMAINDER)}`,
      );

      return Promise.resolve({
        outcome: 'declined',
        reason: 'The card was declined by the issuer.',
      });
    }

    const providerRef = `mock_${randomUUID()}`;
    this.authorisations.set(input.reference, {
      providerRef,
      amountPaisa: input.amountPaisa,
    });

    return Promise.resolve({ outcome: 'authorised', providerRef });
  }

  public capture(providerRef: string): Promise<CaptureResult> {
    const entry = [...this.authorisations.values()].find(
      (authorisation) => authorisation.providerRef === providerRef,
    );

    /* An unknown reference is treated as expired rather than thrown. From
       the caller's side the two are the same situation — there is nothing
       to capture — and the ride still happened either way. */
    if (entry === undefined) {
      return Promise.resolve({
        outcome: 'expired',
        reason: 'That authorisation is no longer available.',
      });
    }

    if (entry.amountPaisa % HUNDRED === EXPIRE_REMAINDER) {
      return Promise.resolve({
        outcome: 'expired',
        reason: 'The authorisation expired before the ride finished.',
      });
    }

    return Promise.resolve({ outcome: 'captured' });
  }

  public void(providerRef: string): Promise<void> {
    for (const [reference, entry] of this.authorisations) {
      if (entry.providerRef === providerRef) {
        this.authorisations.delete(reference);
        break;
      }
    }

    return Promise.resolve();
  }
}
