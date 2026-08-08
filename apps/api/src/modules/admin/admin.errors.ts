import { ConflictError } from '../../common/errors/domain-error';

/**
 * An administrator tried to revoke their own ADMIN role.
 *
 * This one rule is what guarantees the platform always has at least one
 * administrator, and the argument is worth following because it is shorter
 * than it looks.
 *
 * Suppose two admins, A and B. B may revoke A — that is not self-revocation
 * — leaving B as the only admin. B may then revoke nobody but themselves,
 * which this refuses. So the count can fall to one but never to zero, from
 * any starting number, without a single `COUNT(*)` query.
 *
 * The alternative — counting remaining admins on every revocation — is both
 * slower and racy: two concurrent revocations could each see "two admins
 * remain" and both proceed.
 *
 * 409 rather than 403: the caller has every permission required. The
 * request conflicts with an invariant, which is exactly what 409 is for.
 */
export class CannotRevokeOwnAdminRoleError extends ConflictError {
  public readonly code = 'CANNOT_REVOKE_OWN_ADMIN_ROLE';
  public readonly title = 'Cannot remove your own admin role';

  public constructor() {
    super(
      'You cannot remove your own administrator role. Ask another ' +
        'administrator to do it.',
    );
  }
}

/**
 * Someone tried to revoke RIDER.
 *
 * Every account is a rider — registration grants it and nothing else
 * (decision D1). Removing it would leave an account that exists, can sign
 * in, and can do nothing at all: invisible to every role check while still
 * holding its email address. That is not a state any operator means to
 * create, so it is refused rather than supported.
 */
export class CannotRevokeRiderRoleError extends ConflictError {
  public readonly code = 'CANNOT_REVOKE_RIDER_ROLE';
  public readonly title = 'Cannot remove the rider role';

  public constructor() {
    super(
      'Every account is a rider. Deactivate the account instead of ' +
        'removing this role.',
    );
  }
}
