import 'reflect-metadata';

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { setupSwagger, SWAGGER_PATH } from './common/swagger/setup-swagger';
import { AppConfigService } from './config/app-config.service';
import { type Env, EnvValidationError, parseEnv } from './config/env.schema';
import { loadDotenvForLocalDevelopment } from './config/load-dotenv';

/** Every route is served under `/api/v1/...` (docs/api-design.md §2). */
const GLOBAL_PREFIX = 'api';
const DEFAULT_API_VERSION = '1';

async function bootstrap(env: Env): Promise<void> {
  /* `bufferLogs` holds startup messages until the pino logger is installed,
     so even boot-time logs come out structured and correlated rather than
     in Nest's default format. */
  const app = await NestFactory.create(AppModule.forRoot(env), {
    bufferLogs: true,
  });

  /* Replace Nest's default logger process-wide. Every `new Logger(...)`
     anywhere in the codebase now writes structured JSON with request
     context attached — no call site needs to know that. */
  app.useLogger(app.get(PinoLogger));

  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  /* Security headers first, so even error responses carry them. CSP is
     disabled here because this process serves JSON and Swagger UI, not
     documents — the web app sets its own policy. */
  app.use(helmet({ contentSecurityPolicy: false }));

  /* One filter converts every thrown value into an RFC 9457 problem
     details body. Registered here rather than as an APP_FILTER provider so
     it receives the environment directly — production must never leak an
     exception message to a client. */
  app.useGlobalFilters(new ProblemDetailsFilter(config.isProduction));

  /* An explicit origin allow-list with credentials enabled. `origin: '*'`
     together with `credentials: true` is rejected by browsers anyway, and
     would defeat the httpOnly refresh cookie arriving in M3. */
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-Id'],
  });

  /* URI versioning (ADR-007). Declaring it now means a future v2 can
     coexist with v1 instead of breaking every existing client. */
  /* `health` is excluded from the prefix: infrastructure probing whether
     the process is alive should not have to track which version of the
     business API it happens to serve (docs/api-design.md §4). */
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: ['health', 'health/ready'] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });

  const swaggerMounted = setupSwagger(app, config);

  /* Run onModuleDestroy hooks on SIGTERM so in-flight requests finish and
     connection pools close cleanly. Without this, a deploy severs live
     connections mid-request. */
  app.enableShutdownHooks();

  await app.listen(config.port);

  logger.log(
    `API listening on ${config.apiBaseUrl}/${GLOBAL_PREFIX}/v${DEFAULT_API_VERSION} [${config.nodeEnv}]`,
  );
  logger.log(
    swaggerMounted
      ? `API reference at ${config.apiBaseUrl}/${SWAGGER_PATH}`
      : 'API reference disabled (set SWAGGER_ENABLED=true to serve it)',
  );
}

/**
 * Entry point.
 *
 * The environment is validated *before* Nest is constructed. A config error
 * raised inside the DI container gets wrapped in a framework stack trace
 * that buries the actual message; failing here prints the operator a clean,
 * complete report of everything that is wrong.
 *
 * Exiting non-zero is what lets an orchestrator distinguish "this deploy is
 * broken" from "the process finished".
 */
function main(): void {
  let env: Env;

  // Populate process.env from the repo-root .env before validating.
  // No-op in production, where the platform supplies configuration.
  loadDotenvForLocalDevelopment();

  try {
    env = parseEnv(process.env);
  } catch (error: unknown) {
    if (error instanceof EnvValidationError) {
      // Raw stderr, not the Nest logger: configuration is what failed, so
      // the logger's own configuration cannot be trusted.
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  void bootstrap(env).catch((error: unknown) => {
    new Logger('Bootstrap').error('Failed to start the application', error);
    process.exit(1);
  });
}

main();
