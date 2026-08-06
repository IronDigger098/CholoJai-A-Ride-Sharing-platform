import { type IncomingMessage, type ServerResponse } from 'node:http';

import { type DynamicModule, Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { type DestinationStream } from 'pino';

import { type Env } from '../../config/env.schema';

import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

/**
 * Paths excluded from request logging.
 *
 * Health checks are polled every few seconds by the platform. Logging them
 * buries real traffic and inflates log bills for zero diagnostic value —
 * a failing health check surfaces as the deploy going red, not as a log line.
 */
const SILENT_PATHS = new Set(['/health', '/health/ready', '/api/v1/health']);

/**
 * Fields scrubbed before anything is written.
 *
 * This list is a **security control**, not tidiness. Logs are shipped to
 * third-party platforms, retained for months, and read by people who were
 * never granted access to the data. A bearer token in a log line is a live
 * credential sitting in cold storage.
 *
 * Redaction is by path, so new sensitive fields must be added here
 * explicitly — the reason `docs/contributing.md` requires review of any
 * change that logs a request body.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
];

/**
 * Human-readable log stream for local development.
 *
 * Deliberately a **direct stream**, not pino's `transport` option. A
 * transport runs the formatter in a worker thread, and when the API is
 * spawned by `nest start --watch` that worker's stdout does not reliably
 * reach the parent terminal — on Windows the process appears to hang with
 * no output at all. A same-thread stream is marginally slower and
 * completely reliable, which is the right trade for a development-only
 * code path.
 *
 * `pino-pretty` is required lazily so production, where it is not
 * installed, never attempts to resolve it.
 */
function createDevelopmentStream(): DestinationStream {
  /* eslint-disable @typescript-eslint/no-require-imports --
     A static import would be evaluated in production too, where
     pino-pretty is a devDependency and therefore absent. The require must
     stay inside this development-only function. */
  const pinoPretty = require('pino-pretty') as (options: {
    colorize: boolean;
    singleLine: boolean;
    translateTime: string;
    ignore: string;
    messageFormat: string;
  }) => DestinationStream;
  /* eslint-enable @typescript-eslint/no-require-imports */

  return pinoPretty({
    colorize: true,
    singleLine: true,
    /* The `SYS:` prefix renders in the machine's local timezone. Without
       it pino-pretty prints UTC, so a developer in Dhaka reads logs six
       hours off their own clock while trying to correlate a timestamp with
       a bug report. Production logs keep UTC epoch millis, which is
       correct — machines should agree on time; humans should not have to
       do arithmetic. */
    translateTime: 'SYS:HH:MM:ss.l',
    ignore: 'pid,hostname',
    messageFormat: '[{req.id}] {msg}',
  });
}

/**
 * Structured JSON logging with per-request correlation.
 *
 * `nestjs-pino` is used rather than Nest's default logger for three
 * reasons: pino emits JSON (queryable) instead of formatted strings; it
 * carries request context through `AsyncLocalStorage`, so a service five
 * calls deep logs the request id without anyone threading it through
 * function signatures; and it is fast enough that logging is not a
 * throughput concern.
 *
 * Development output is pretty-printed for readability. Production output
 * is raw newline-delimited JSON straight to stdout, which is what every log
 * platform ingests.
 */
@Module({})
export class LoggingModule {
  public static forRoot(env: Env): DynamicModule {
    const isProduction = env.NODE_ENV === 'production';

    const pinoHttpOptions = {
      level: env.LOG_LEVEL,

      // Reuse a well-formed inbound id so one user action shares a single
      // id across web app, API, and background jobs.
      genReqId: (req: IncomingMessage, res: ServerResponse): string => {
        const id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
        // Echo it immediately, so the client has the id even if the
        // request later fails inside a handler.
        res.setHeader('X-Request-Id', id);
        return id;
      },

      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },

      autoLogging: {
        ignore: (req: IncomingMessage): boolean =>
          SILENT_PATHS.has(req.url ?? ''),
      },

      // Log the fields that aid diagnosis, and nothing else. The default
      // serializers dump every header on every request.
      serializers: {
        req: (req: {
          id: string;
          method: string;
          url: string;
          remoteAddress?: string;
        }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          ...(isProduction ? {} : { remoteAddress: req.remoteAddress }),
        }),
        res: (res: { statusCode: number }) => ({
          statusCode: res.statusCode,
        }),
      },

      customSuccessMessage: (
        req: IncomingMessage,
        res: ServerResponse,
      ): string => `${req.method ?? 'GET'} ${req.url ?? '/'} ${res.statusCode}`,

      customErrorMessage: (req: IncomingMessage, res: ServerResponse): string =>
        `${req.method ?? 'GET'} ${req.url ?? '/'} ${res.statusCode}`,
    };

    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRoot({
          /* Express 5 (via path-to-regexp v8) no longer accepts a bare `*`
             wildcard; it must be a named parameter. Without this, Nest logs
             a deprecation warning and auto-converts it on every boot. A
             production service should start clean. */
          forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],

          pinoHttp: isProduction
            ? pinoHttpOptions
            : [pinoHttpOptions, createDevelopmentStream()],
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
