import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AppConfigService } from '../../config/app-config.service';

/** Mirrors Prisma's own `LogLevel`, kept local to avoid a namespace import
    for four string literals that have not changed in years. */
type PrismaLogLevel = 'query' | 'info' | 'warn' | 'error';

/**
 * How loud the client should be, by environment.
 *
 * Development wants every statement: an accidental N+1 is obvious the
 * moment you see twenty identical SELECTs. Production must not have them —
 * high volume, and the parameters carry user data.
 *
 * Tests are the case that is easy to miss. They connect to a real database
 * and run hundreds of statements, and with `query` on, each one costs a
 * `console.log` and a stack frame in Jest's output. That was 2,198 lines of
 * SQL for 34 assertions in CI, which does not merely waste space — it
 * buries the failure you opened the log to find. Anyone who wants the
 * statements back for one run can pass `--silent=false` after re-enabling
 * them here, which is a deliberate act rather than the default.
 */
export function logLevelsFor(config: AppConfigService): PrismaLogLevel[] {
  if (config.isProduction) return ['error'];
  if (config.isTest) return ['warn', 'error'];

  return ['query', 'warn', 'error'];
}

/**
 * The application's single database connection pool.
 *
 * Extends `PrismaClient` rather than wrapping it: the generated client is
 * already a well-typed data-access API, and wrapping it would mean
 * hand-writing a delegate method for every model — a large amount of code
 * that adds no behaviour. Repositories in feature modules inject this and
 * expose domain-shaped methods; nothing outside a repository touches it
 * (architecture §3).
 *
 * Lifecycle is bound to the Nest container so that `enableShutdownHooks()`
 * in main.ts closes the pool cleanly on SIGTERM. Without that, a deploy
 * severs in-flight queries and leaves connections dangling on the server
 * until they time out.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  public constructor(config: AppConfigService) {
    super({
      // Taken from validated configuration rather than read from
      // process.env by Prisma itself, so the URL passes through the same
      // schema check as every other setting.
      datasourceUrl: config.databaseUrl,

      /* See `logLevelsFor` for why each environment gets what it gets.

         These go to stdout rather than through pino. Routing them into the
         structured logger needs Prisma's event API, which is worth doing
         once query volume makes it useful; today it would be indirection
         for its own sake. */
      log: logLevelsFor(config),
    });
  }

  public async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Cheap liveness check for the readiness probe.
   *
   * `SELECT 1` rather than a real query: it proves the pool can hand out a
   * working connection and the server answers, without touching a table
   * whose absence would make the probe fail for the wrong reason.
   */
  public async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error: unknown) {
      this.logger.error('Database readiness check failed', error);
      return false;
    }
  }
}
