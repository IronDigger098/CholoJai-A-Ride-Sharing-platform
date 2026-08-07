import {
  type RegisterRequest,
  type RegisterResponse,
  UserRole,
  type UserSummary,
  type VerifyEmailResponse,
} from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { PasswordHasherService } from '../../common/security/password-hasher.service';
import {
  USER_REPOSITORY,
  type UserRecord,
  type UserRepository,
} from '../users/user-repository.port';

import { EmailAlreadyRegisteredError } from './auth.errors';
import { EmailVerificationService } from './email-verification.service';

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
