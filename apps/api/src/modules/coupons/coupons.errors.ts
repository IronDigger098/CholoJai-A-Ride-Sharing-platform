import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/domain-error';

/**
 * Why a coupon did not apply.
 *
 * Six separate errors rather than one "invalid coupon", because a rider can
 * act on the difference. "That code has expired" and "your fare is below the
 * minimum" lead somewhere; a single refusal leads to trying the same code
 * again.
 *
 * None of them reveal anything a rider could not learn by trying: whether a
 * code exists is already discoverable, and the alternative — a uniform
 * message — would mostly punish honest typists.
 */

export class CouponNotFoundError extends NotFoundError {
  public readonly code = 'COUPON_NOT_FOUND';
  public readonly title = 'No such code';

  public constructor() {
    super('That code does not exist. Check the spelling and try again.');
  }
}

/** Retired by an administrator, or not started yet, or finished. */
export class CouponNotRunningError extends UnprocessableError {
  public readonly code = 'COUPON_NOT_RUNNING';
  public readonly title = 'That offer is not running';

  public constructor(reason: string) {
    super(reason);
  }
}

export class CouponExhaustedError extends ConflictError {
  public readonly code = 'COUPON_EXHAUSTED';
  public readonly title = 'That offer has been fully claimed';

  public constructor() {
    super('This code has reached its limit and can no longer be used.');
  }
}

export class CouponAlreadyUsedError extends ConflictError {
  public readonly code = 'COUPON_ALREADY_USED';
  public readonly title = 'You have already used this code';

  public constructor(limit: number) {
    super(
      limit === 1
        ? 'This code can be used once per rider, and you have used it.'
        : `This code can be used ${String(limit)} times per rider, and you have used it that many times.`,
    );
  }
}

export class FareBelowCouponMinimumError extends UnprocessableError {
  public readonly code = 'FARE_BELOW_COUPON_MINIMUM';
  public readonly title = 'This journey is too short for that code';

  public constructor() {
    super('This code applies to longer journeys than the one you priced.');
  }
}

export class CouponForFirstRideOnlyError extends UnprocessableError {
  public readonly code = 'COUPON_FIRST_RIDE_ONLY';
  public readonly title = 'That code is for a first ride';

  public constructor() {
    super('This code is for riders who have not taken a ride yet.');
  }
}

/** Two administrators, one code. The unique index refuses the second. */
export class CouponCodeTakenError extends ConflictError {
  public readonly code = 'COUPON_CODE_TAKEN';
  public readonly title = 'That code already exists';

  public constructor(couponCode: string) {
    super(`A campaign already uses the code ${couponCode}.`);
  }
}
