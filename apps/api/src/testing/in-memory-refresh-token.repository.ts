import {
  type CreateRefreshTokenInput,
  type RefreshTokenRecord,
  type RefreshTokenRepository,
  type RotateRefreshTokenInput,
} from '../modules/auth/refresh-token-repository.port';

/**
 * Mutable storage for the fake.
 *
 * `RefreshTokenRecord` is readonly — correct, because a caller must not
 * mutate a record the repository handed back. The fake owns its rows, so it
 * needs a writable shape internally and returns the readonly view.
 *
 * `createdAt` is here but not on the port's record type: only
 * `familyStartedAt` needs it, and exposing it would invite callers to do
 * their own date arithmetic instead of asking the repository.
 */
interface StoredRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
}

/**
 * An in-memory stand-in for the refresh-token table.
 *
 * Shared between the auth-service and rotation suites rather than copied
 * into each, because a fake that drifts from the port it implements is a
 * test suite that passes while the real adapter is broken.
 *
 * One thing it cannot fake is the concurrency guarantee. `rotate` here is
 * atomic only because JavaScript is single-threaded between awaits;
 * PostgreSQL earns the same property with a row lock and a re-checked
 * predicate. The tests below can prove the *logic* of losing a race, not
 * that Postgres actually serialises it — that belongs to the integration
 * suite in M3.10.
 */
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  public readonly rows: StoredRefreshToken[] = [];
  private nextId = 1;

  /** Overridable so tests can place rows at a chosen point in time. */
  public now: () => Date = () => new Date();

  public async create(
    input: CreateRefreshTokenInput,
  ): Promise<RefreshTokenRecord> {
    const row: StoredRefreshToken = {
      id: `rt_${this.nextId++}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      familyId: input.familyId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      replacedById: null,
      createdAt: this.now(),
    };

    this.rows.push(row);
    return toRecord(row);
  }

  public async findByHash(
    tokenHash: string,
  ): Promise<RefreshTokenRecord | null> {
    const row = this.rows.find(
      (candidate) => candidate.tokenHash === tokenHash,
    );
    return row === undefined ? null : toRecord(row);
  }

  public async revokeFamily(familyId: string): Promise<number> {
    const targets = this.rows.filter(
      (row) => row.familyId === familyId && row.revokedAt === null,
    );

    for (const row of targets) row.revokedAt = this.now();

    return targets.length;
  }

  public async revokeAllForUser(userId: string): Promise<number> {
    const targets = this.rows.filter(
      (row) => row.userId === userId && row.revokedAt === null,
    );

    for (const row of targets) row.revokedAt = this.now();

    return targets.length;
  }

  public async rotate(
    input: RotateRefreshTokenInput,
  ): Promise<RefreshTokenRecord | null> {
    const current = this.rows.find((row) => row.id === input.currentId);

    if (current === undefined) return null;

    // The conditional that Postgres expresses as `WHERE revoked_at IS NULL`.
    // Written as its own statement rather than folded into the check above:
    // this line is the concurrency guarantee, and it should be impossible
    // to delete by accident while tidying a boolean expression.
    if (current.revokedAt !== null) return null;

    current.revokedAt = this.now();

    const successor = await this.create(input.successor);
    current.replacedById = successor.id;

    return successor;
  }

  public async familyStartedAt(familyId: string): Promise<Date | null> {
    const times = this.rows
      .filter((row) => row.familyId === familyId)
      .map((row) => row.createdAt.getTime());

    return times.length === 0 ? null : new Date(Math.min(...times));
  }

  /** Test helper: find a stored row by the plaintext's hash. */
  public byHash(tokenHash: string): StoredRefreshToken | undefined {
    return this.rows.find((row) => row.tokenHash === tokenHash);
  }
}

function toRecord(row: StoredRefreshToken): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replacedById: row.replacedById,
  };
}
