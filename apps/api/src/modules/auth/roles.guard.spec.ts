import { UserRole } from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';
import { type ExecutionContext } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';

import { InsufficientPermissionError } from '../../common/errors/domain-error';

import { InvalidAccessTokenError } from './auth.errors';
import {
  type AuthenticatedRequest,
  type AuthenticatedUser,
} from './authenticated-request';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

function makeContext(user?: AuthenticatedUser): ExecutionContext {
  const request = { user } as AuthenticatedRequest;

  return {
    getHandler: () => (): void => undefined,
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeGuard(required?: readonly UserRole[]): RolesGuard {
  const reflector = {
    getAllAndOverride: (key: unknown) =>
      key === ROLES_KEY ? required : undefined,
  } as unknown as Reflector;

  return new RolesGuard(reflector);
}

const rider: AuthenticatedUser = { id: 'user_1', roles: [UserRole.RIDER] };
const driver: AuthenticatedUser = {
  id: 'user_2',
  roles: [UserRole.RIDER, UserRole.DRIVER],
};
const admin: AuthenticatedUser = {
  id: 'user_3',
  roles: [UserRole.RIDER, UserRole.ADMIN],
};

describe('RolesGuard', () => {
  describe('when a route declares no roles', () => {
    it('allows any authenticated caller', () => {
      // Authentication only. Saying nothing is not the same as denying.
      expect(makeGuard(undefined).canActivate(makeContext(rider))).toBe(true);
      expect(makeGuard([]).canActivate(makeContext(rider))).toBe(true);
    });
  });

  describe('when a route requires a role', () => {
    it('allows a caller who holds it', () => {
      const guard = makeGuard([UserRole.ADMIN]);
      expect(guard.canActivate(makeContext(admin))).toBe(true);
    });

    it('allows a caller who holds any one of several', () => {
      const guard = makeGuard([UserRole.DRIVER, UserRole.ADMIN]);

      expect(guard.canActivate(makeContext(driver))).toBe(true);
      expect(guard.canActivate(makeContext(admin))).toBe(true);
    });

    it('rejects a caller who holds none of them', () => {
      const guard = makeGuard([UserRole.ADMIN]);

      expect(() => guard.canActivate(makeContext(rider))).toThrow(
        InsufficientPermissionError,
      );
    });

    it('answers 403, not 401, for a signed-in caller', () => {
      /* The distinction is not pedantry: 401 tells a client to get
         credentials and retry, 403 tells it retrying is pointless. Collapse
         them and a client either loops on a permission error or gives up on
         a fixable one. */
      const guard = makeGuard([UserRole.ADMIN]);

      try {
        guard.canActivate(makeContext(rider));
        throw new Error('expected a rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientPermissionError);
        expect((error as InsufficientPermissionError).status).toBe(403);
      }
    });
  });

  describe('roles do not form a hierarchy', () => {
    it('does not let an ADMIN through a DRIVER-only route', () => {
      /* The most valuable test here. A hierarchy feels tidy and is a common
         source of accidental privilege: the moment ADMIN implies DRIVER, an
         administrator can accept ride requests and appear in driver
         matching. If an admin needs to drive, they get a DRIVER grant. */
      const guard = makeGuard([UserRole.DRIVER]);

      expect(() => guard.canActivate(makeContext(admin))).toThrow(
        InsufficientPermissionError,
      );
    });

    it('does not let a DRIVER through an ADMIN-only route', () => {
      const guard = makeGuard([UserRole.ADMIN]);

      expect(() => guard.canActivate(makeContext(driver))).toThrow(
        InsufficientPermissionError,
      );
    });
  });

  describe('when authentication did not run', () => {
    it('rejects rather than allowing the request through', () => {
      /* Reachable only if someone applies @Roles without an authentication
         guard. `@Auth()` makes that combination unwriteable, but
         "unreachable" is a claim about today's code and the cost of being
         wrong is an open admin endpoint. */
      const guard = makeGuard([UserRole.ADMIN]);

      expect(() => guard.canActivate(makeContext(undefined))).toThrow(
        InvalidAccessTokenError,
      );
    });

    it('answers 401 there, because identity is what is missing', () => {
      const guard = makeGuard([UserRole.ADMIN]);

      try {
        guard.canActivate(makeContext(undefined));
        throw new Error('expected a rejection');
      } catch (error) {
        expect((error as InvalidAccessTokenError).status).toBe(401);
      }
    });
  });

  describe('what the rejection discloses', () => {
    it('names neither the required role nor the roles held', () => {
      // Telling a rider that an endpoint wants ADMIN maps the privilege
      // model for anyone probing, and they cannot act on it regardless.
      const guard = makeGuard([UserRole.ADMIN]);

      try {
        guard.canActivate(makeContext(rider));
        throw new Error('expected a rejection');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).not.toContain('ADMIN');
        expect(message).not.toContain('RIDER');
      }
    });
  });
});
