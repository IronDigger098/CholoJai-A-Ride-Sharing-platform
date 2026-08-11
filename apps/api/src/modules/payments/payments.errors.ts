import { UnprocessableError } from '../../common/errors/domain-error';

/**
 * The card said no.
 *
 * 422 rather than 402: the request was well-formed and the rider may well
 * be able to pay another way, so this is a fact about this attempt rather
 * than a demand for money. `code` is what the web app keys off to put the
 * message beside the payment picker instead of in a banner.
 */
export class PaymentDeclinedError extends UnprocessableError {
  public readonly code = 'PAYMENT_DECLINED';
  public readonly title = 'That payment was declined';

  public constructor(reason: string) {
    super(`${reason} Try another method, or pay the driver in cash.`);
  }
}
