import {
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type RegisterRequest,
  type RegisterResponse,
  UserRole,
  type UserSummary,
  type VerifyEmailResponse,
} from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ResourceNotFoundError } from '../../common/errors/domain-error';
import { AccessTokenService } from '../../common/security/access-token.service';
import { PasswordHasherService } from '../../common/security/password-hasher.service';
import {
  USER_REPOSITORY,
  type UserRecord,
  type UserRepository,
} from '../users/user-repository.port';

import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from './auth.errors';
import { EmailVerificationService } from './email-verification.service';
import { RefreshTokenService } from './refresh-token.service';

/**
 * What a successful sign-in produces.
 *
 * The refresh token comes back *beside* the response body rather than
 * inside it, because it does not belong in the body — the controller puts
 * it in an httpOnly cookie. Returning it as a separate field is how this
 * service hands over a secret without knowing what a cookie is.
 */
export interface LoginResult {
  readonly response: LoginResponse;
  readonly refreshToken: string;
}

/**
 * Authentication business logic.
 *
 * Knows nothing about HTTP: no request objects, no status codes, no
 * response. It throws domain errors and returns plain data, which is why
 * every test below runs against an in-memory repository in milliseconds
 * instead of needing a live database and a running server.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  public constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly emailVerification: EmailVerificationService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
   * Register a new account.
   *
   * The new user is granted `RIDER` and nothing else. Roles are never
   * accepted from the request — a client sending `roles: ['ADMIN']` has it
   * stripped by the Zod schema, and even if it survived, this method
   * ignores the input entirely. Privilege must be granted by the system,
   * never requested by the caller.
   *
   * Becoming a driver is a separate, reviewed flow (M7); admin is granted
   * out of band. That is decision D1 — one account, roles added over time —
   * working as intended.
   */
  public async register(input: RegisterRequest): Promise<RegisterResponse> {
    /* Check first for a clear, immediate error. The database's unique index
       on email is the actual guarantee — two simultaneous registrations for
       the same address will race past this check, and one of them will hit
       the constraint. That is correct: the check is for the message, the
       index is for the truth. */
    if (await this.users.existsByEmail(input.email)) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    const user = await this.users.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone,
      roles: [UserRole.RIDER],
    });

    /* Log the event, never the payload. `input` holds a plaintext password;
       logging it — even at debug — would write credentials to disk and ship
       them to a log platform. Identify the actor by id. */
    this.logger.log(`Registered user ${user.id}`);

    /* Send the verification email, but do NOT let a mail failure fail the
       registration. The account exists and the password is stored; making
       the whole request fail would leave the user unable to retry (their
       email is now taken) for a problem entirely on our side. They can
       request a new link from /auth/resend-verification. */
    try {
      await this.emailVerification.sendVerificationEmail(user);
    } catch (error: unknown) {
      this.logger.error(
        `Registered user ${user.id} but the verification email failed to send`,
        error,
      );
    }

    return {
      user: toUserSummary(user),
      emailVerificationRequired: true,
    };
  }

  /**
   * Exchange credentials for a session.
   *
   * Three things happen here that are easy to get wrong, in order:
   *
   * **1. Every failure costs the same.** A missing account and a wrong
   * password both raise `InvalidCredentialsError`, and both spend the same
   * ~50ms of argon2 — see `verifyAgainstDecoy`. Matching the message
   * without matching the timing leaves the enumeration hole wide open.
   *
   * **2. An unverified address may still sign in.** Deliberate. Refusing
   * would give a *different* error for a real account than for a fake one,
   * which is user enumeration reintroduced through the front door; it also
   * traps someone whose verification mail bounced with no way to reach the
   * resend button. Verification is enforced where it matters — booking a
   * ride, becoming a driver — not at the door. The response carries
   * `emailVerified` so the client can prompt.
   *
   * **3. The stored hash is upgraded in passing.** Successful login is the
   * only moment the plaintext is legitimately in memory, so it is the only
   * moment a hash produced with older, cheaper parameters can be replaced.
   */
  public async login(input: LoginRequest): Promise<LoginResult> {
    const user = await this.users.findByEmail(input.email);

    if (user === null) {
      await this.passwordHasher.verifyAgainstDecoy(input.password);
      this.logger.warn('Failed sign-in: no account for the given address');
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.passwordHasher.verify(
      user.passwordHash,
      input.password,
    );

    if (!passwordMatches) {
      this.logger.warn(`Failed sign-in for user ${user.id}: wrong password`);
      throw new InvalidCredentialsError();
    }

    await this.upgradePasswordHashIfStale(user, input.password);

    const accessToken = this.accessTokens.sign({
      sub: user.id,
      roles: [...user.roles],
    });
    const refresh = await this.refreshTokens.issueForNewSession(user.id);

    this.logger.log(`Signed in user ${user.id}`);

    return {
      response: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.accessTokens.ttlSeconds,
        user: toUserSummary(user),
      },
      refreshToken: refresh.plaintext,
    };
  }

  /**
   * End a session.
   *
   * Takes the refresh token rather than the caller's identity, because
   * signing out is about *this device*, not the account — and because the
   * cookie is available on a request that may well carry an access token
   * that expired ten minutes ago. Requiring a valid access token to sign
   * out would mean the sign-out button stops working before the session does.
   */
  public async logout(refreshToken: string | null): Promise<void> {
    if (refreshToken === null) {
      // No cookie: nothing to revoke, and the client is clearing its own
      // state regardless. Silence is the correct response.
      return;
    }

    await this.refreshTokens.revokeSession(refreshToken);
  }

  /** The signed-in user's current profile, read fresh rather than from claims. */
  public async getProfile(userId: string): Promise<MeResponse> {
    const user = await this.users.findById(userId);

    if (user === null) {
      /* A valid, unexpired token for an account that no longer exists —
         deleted or deactivated since the token was issued. 404 rather than
         401: the credential is genuine, the subject is gone. */
      throw new ResourceNotFoundError('user', userId);
    }

    return { user: toUserSummary(user) };
  }

  /**
   * Re-hash a password that was stored with weaker parameters.
   *
   * A failure here must not fail the login. The user typed the right
   * password; their existing hash still verifies; the only loss is that
   * the upgrade retries next time they sign in.
   */
  private async upgradePasswordHashIfStale(
    user: UserRecord,
    plaintext: string,
  ): Promise<void> {
    if (!this.passwordHasher.needsRehash(user.passwordHash)) return;

    try {
      const upgraded = await this.passwordHasher.hash(plaintext);
      await this.users.updatePasswordHash(user.id, upgraded);
      this.logger.log(`Upgraded password hash parameters for user ${user.id}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to upgrade the password hash for user ${user.id}`,
        error,
      );
    }
  }

  /** Consume a verification token. Delegates to the verification flow. */
  public async verifyEmail(token: string): Promise<VerifyEmailResponse> {
    const user = await this.emailVerification.verify(token);
    return { user: toUserSummary(user) };
  }

  /** Request a fresh verification link. Silent about whether it applied. */
  public async resendVerification(email: string): Promise<void> {
    await this.emailVerification.resend(email);
  }
}

/**
 * Map a persisted user to the public response shape.
 *
 * Explicit field-by-field rather than spreading the record. A spread would
 * mean that adding a sensitive column to the database silently publishes it
 * through this endpoint — `passwordHash` is one schema change away from
 * leaking. Listing fields makes exposure a deliberate act.
 */
export function toUserSummary(user: UserRecord): UserSummary {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerifiedAt !== null,
    roles: [...user.roles],
    createdAt: user.createdAt.toISOString(),
  };
}
