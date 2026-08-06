import { Inject, Injectable } from '@nestjs/common';

import { DATABASE_PROBE, type DatabaseProbe } from './database-probe';
import { type HealthResponseDto } from './dto/health-response.dto';
import { type ReadinessResponseDto } from './dto/readiness-response.dto';

/** Fallback when the version is not injected at build time. */
const UNKNOWN_VERSION = '0.0.0';

/**
 * Health reporting.
 *
 * Logic lives here rather than in the controller even where it is trivial,
 * because the layering rule (architecture §3) is not conditional on
 * complexity — and readiness has just proved the point by growing a
 * dependency without the controller changing at all.
 */
@Injectable()
export class HealthService {
  /** Captured once at construction so uptime measures from app start. */
  private readonly startedAt = Date.now();

  public constructor(
    @Inject(DATABASE_PROBE) private readonly database: DatabaseProbe,
  ) {}

  public getLiveness(): HealthResponseDto {
    return {
      status: 'ok',
      uptimeSeconds: Number(((Date.now() - this.startedAt) / 1000).toFixed(2)),
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? UNKNOWN_VERSION,
    };
  }

  /**
   * Readiness: should this instance receive traffic?
   *
   * This one *does* check dependencies. The difference from liveness is
   * consequence, not thoroughness: a failing readiness probe removes the
   * instance from the load balancer, and it rejoins when the dependency
   * recovers. A failing liveness probe gets the process killed. Checking
   * the database in liveness would turn a thirty-second database blip into
   * a restart storm across every healthy instance.
   */
  public async getReadiness(): Promise<ReadinessResponseDto> {
    const startedAt = Date.now();
    const databaseUp = await this.database.isReachable();
    const latencyMs = Date.now() - startedAt;

    return {
      status: databaseUp ? 'ready' : 'not_ready',
      database: { status: databaseUp ? 'up' : 'down', latencyMs },
      timestamp: new Date().toISOString(),
    };
  }
}
