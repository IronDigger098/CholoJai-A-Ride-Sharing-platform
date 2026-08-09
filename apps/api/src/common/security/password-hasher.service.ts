import { randomBytes } from 'node:crypto';

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { hash, type Options, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters.
 *
 * These follow OWASP's Password Storage Cheat Sheet (2024 guidance):
 * 19 MiB of memory, 2 iterations, 1 degree of parallelism.
 *
 * The point of a password hash is to be *expensive*. SHA-256 is the wrong
 * tool precisely because it is fast — a GPU computes billions per second,
 * so a leaked table falls in a weekend. Argon2id is **memory-hard**: each
 * hash demands ~19 MiB, and memory is the one resource custom cracking
 * hardware cannot multiply cheaply. Bcrypt, by comparison, is CPU-hard but
 * uses only 4 KiB, which is why FPGA and ASIC attacks against it scale so
 * well.
 *
 * Tuning rule: raise `memoryCost` until a single hash takes roughly 50ms on
 * production hardware. Below that an attacker gets too many guesses per
 * second; far above it and a login queue becomes a denial-of-service
 * surface against yourself.
 *
 * These values are versioned into every hash argon2 produces, so raising
 * them later does not invalidate existing passwords — see `needsRehash`.
 */
const ARGON2_OPTIONS: Options = {
  // Argon2id — argon2i's side-channel resistance plus argon2d's GPU
  // resistance. Argon2i and argon2d alone each give up one of those.
  algorithm: 2,
  memoryCost: 19_456, // KiB (19 MiB)
  timeCost: 2, // iterations
  parallelism: 1,
};

/**
 * Turns passwords into verifiable, non-reversible hashes.
 *
 * The only component permitted to touch a plaintext password. Everything
 * else — services, controllers, tests — deals in hashes, which keeps the
 * surface where a password could be logged, serialised, or accidentally
 * returned to exactly one file.
 */
@Injectable()
export class PasswordHasherService implements OnModuleInit {
  private readonly logger = new Logger(PasswordHasherService.name);

  /**
   * A hash of a random string nobody knows, used to burn time deliberately.
   *
   * Cached as the *promise*, not the value, so concurrent callers during
   * startup share one computation instead of each paying 50ms.
   */
  private decoy: Promise<string> | undefined;

  /**
   * Warm the decoy at boot.
   *
   * Computing it lazily on the first failed login would make that one
   * request ~50ms slower than its neighbours — a timing signal on exactly
   * the code path built to eliminate one. Nest awaits this hook before the
   * application accepts traffic.
   */
  public async onModuleInit(): Promise<void> {
    await this.decoyHash();
  }

  /**
   * Hash a password for storage.
   *
   * No salt parameter: argon2 generates a cryptographically random salt per
   * call and embeds it in the output string, along with the algorithm and
   * its parameters. That is why two identical passwords produce different
   * hashes, and why a precomputed rainbow table is useless here.
   */
  public async hash(plaintext: string): Promise<string> {
    return hash(plaintext, ARGON2_OPTIONS);
  }

  /**
   * Check a password against a stored hash.
   *
   * Argon2's own comparison is constant-time with respect to the digest, so
   * an attacker cannot learn how much of a guess was correct by measuring
   * how long the answer took.
   *
   * A malformed or corrupt stored hash returns `false` rather than
   * throwing. A login attempt against a broken record must fail closed —
   * denying access — not surface a 500 that tells an attacker they found
   * something unusual.
   */
  public async verify(hashed: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(hashed, plaintext, ARGON2_OPTIONS);
    } catch (error: unknown) {
      this.logger.error(
        'Password verification failed on a malformed hash',
        error,
      );
      return false;
    }
  }

  /**
   * Spend the same time verifying as a real check would, and fail.
   *
   * This exists because of a timing side channel that is easy to miss. The
   * natural way to write login is:
   *
   * ```ts
   * const user = await users.findByEmail(email);
   * if (user === null) throw new InvalidCredentialsError();   // ~1ms
   * if (!(await verify(user.passwordHash, password))) throw …; // ~50ms
   * ```
   *
   * Both paths return the same 401 with the same body — and are trivially
   * distinguishable with a stopwatch, because argon2 is deliberately slow
   * and skipping it is deliberately fast. An attacker with a list of
   * addresses learns which ones have accounts by timing the responses,
   * defeating the generic error message entirely.
   *
   * Hashing against a decoy makes the two paths cost the same. It is not
   * perfectly constant-time — nothing over a network is — but it removes
   * the order-of-magnitude difference that makes the attack practical.
   *
   * Always returns `false`; the return type says so, so no call site can
   * misread it as a check that might pass.
   */
  public async verifyAgainstDecoy(plaintext: string): Promise<false> {
    await this.verify(await this.decoyHash(), plaintext);
    return false;
  }

  private decoyHash(): Promise<string> {
    /* A fresh random secret per process. A hardcoded constant would work
       just as well for timing, but this way there is no string in the
       repository that looks like a password hash and invites someone to
       wonder whether it is one. */
    this.decoy ??= this.hash(randomBytes(32).toString('base64url'));
    return this.decoy;
  }

  /**
   * Was this hash produced with weaker parameters than we now use?
   *
   * Parameters must rise as hardware improves, but existing users cannot be
   * asked to re-enter their password so we can upgrade it. The standard
   * pattern: at successful login — the one moment the plaintext is legally
   * in memory — check this, and if true, re-hash and store transparently.
   * Every active user migrates to stronger parameters simply by signing in.
   */
  public needsRehash(hashed: string): boolean {
    const parsed = parseArgon2Parameters(hashed);
    if (parsed === null) {
      // Unparseable means it was not produced by our current scheme —
      // upgrade it on the next successful login.
      return true;
    }

    return (
      parsed.memoryCost < (ARGON2_OPTIONS.memoryCost ?? 0) ||
      parsed.timeCost < (ARGON2_OPTIONS.timeCost ?? 0)
    );
  }
}

/**
 * Read the cost parameters out of a PHC-format argon2 string.
 *
 * The format is:
 *   `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<digest>`
 *
 * Parsed by hand rather than pulled from a dependency: it is a documented,
 * stable format, and the alternative is taking on a package to read four
 * integers out of a string.
 */
function parseArgon2Parameters(
  hashed: string,
): { memoryCost: number; timeCost: number; parallelism: number } | null {
  const match = /\$argon2(?:id|i|d)\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/u.exec(
    hashed,
  );
  if (match === null) return null;

  const [, memory, time, parallel] = match;
  if (memory === undefined || time === undefined || parallel === undefined) {
    return null;
  }

  return {
    memoryCost: Number(memory),
    timeCost: Number(time),
    parallelism: Number(parallel),
  };
}
