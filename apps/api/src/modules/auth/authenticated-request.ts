import { type UserRole } from '@cholojai/shared';
import { type Request } from 'express';

/**
 * Who the caller is, as established by {@link JwtAuthGuard}.
 *
 * Two fields, and no more. This is not a user profile — it is the identity
 * and permissions the request runs under, reconstructed from a token that
 * may be up to one access-token lifetime old. A handler that needs the
 * user's current email, name, or verification state must load it; putting
 * those here would encourage serving stale data from a token.
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly roles: readonly UserRole[];
}

/**
 * An Express request that the auth guard may have annotated.
 *
 * `user` is optional on purpose: the type describes what a request *may*
 * carry, so a handler cannot read it without acknowledging that the guard
 * might not have run. `@CurrentUser()` does that acknowledgement once, in
 * one place, and hands the rest of the codebase a non-optional value.
 *
 * Declared as a local interface rather than by augmenting Express's global
 * `Request` type. Global augmentation would put `user` on every request
 * object in the process — including in modules that have nothing to do
 * with authentication — and make its origin invisible to anyone reading
 * the code.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
