import { type ProblemDetails } from '@cholojai/shared';
import { describe, expect, it, jest } from '@jest/globals';
import {
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';

import {
  AuthenticationRequiredError,
  ConflictError,
  ResourceNotFoundError,
  ValidationFailedError,
} from '../errors/domain-error';

import { ProblemDetailsFilter } from './problem-details.filter';

/** Capture what the filter writes, without a real HTTP server. */
function makeHost(requestId = 'req-abc12345'): {
  host: ArgumentsHost;
  captured: () => { status: number; type: string; body: ProblemDetails };
} {
  let status = 0;
  let type = '';
  let body = {} as ProblemDetails;

  const response = {
    status: (code: number) => {
      status = code;
      return response;
    },
    type: (contentType: string) => {
      type = contentType;
      return response;
    },
    json: (payload: ProblemDetails) => {
      body = payload;
      return response;
    },
  };

  const request = { originalUrl: '/api/v1/rides/abc', id: requestId };

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, captured: () => ({ status, type, body }) };
}

/** A feature-module error, defined the way real modules will define theirs. */
class RideAlreadyAcceptedError extends ConflictError {
  public readonly code = 'RIDE_ALREADY_ACCEPTED';
  public readonly title = 'Ride already accepted';

  public constructor() {
    super('This ride was accepted by another driver.');
  }
}

describe('ProblemDetailsFilter', () => {
  const devFilter = new ProblemDetailsFilter(false);
  const prodFilter = new ProblemDetailsFilter(true);

  /* Spy on Logger.prototype rather than the filter's private field: tests
     should exercise the public surface, and reaching into internals means
     a harmless refactor breaks the suite. This also silences output so
     test results stay readable. */
  let errorSpy: jest.SpiedFunction<typeof Logger.prototype.error>;
  let warnSpy: jest.SpiedFunction<typeof Logger.prototype.warn>;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('response envelope', () => {
    it('always uses the application/problem+json content type', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new ResourceNotFoundError('ride', 'abc'), host);
      expect(captured().type).toBe('application/problem+json');
    });

    it('includes the request id so a user can quote it', () => {
      const { host, captured } = makeHost('trace-me-123456');
      devFilter.catch(new ResourceNotFoundError('ride'), host);
      expect(captured().body.requestId).toBe('trace-me-123456');
    });

    it('includes the path that failed', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new ResourceNotFoundError('ride'), host);
      expect(captured().body.instance).toBe('/api/v1/rides/abc');
    });
  });

  describe('domain errors', () => {
    it('maps a not-found error to 404 with its code', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new ResourceNotFoundError('ride', 'abc'), host);

      const { status, body } = captured();
      expect(status).toBe(HttpStatus.NOT_FOUND);
      expect(body.code).toBe('NOT_FOUND');
      expect(body.detail).toContain('abc');
    });

    it('maps a feature-defined conflict to 409 with its own code', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new RideAlreadyAcceptedError(), host);

      const { status, body } = captured();
      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.code).toBe('RIDE_ALREADY_ACCEPTED');
      expect(body.title).toBe('Ride already accepted');
    });

    it('derives the type URI from the code', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new RideAlreadyAcceptedError(), host);
      expect(captured().body.type).toBe(
        'https://cholojai.app/errors/ride-already-accepted',
      );
    });

    it('distinguishes 401 from 403', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new AuthenticationRequiredError(), host);
      expect(captured().status).toBe(HttpStatus.UNAUTHORIZED);
      expect(captured().body.code).toBe('UNAUTHENTICATED');
    });

    it('carries field errors when present', () => {
      const { host, captured } = makeHost();
      devFilter.catch(
        new ValidationFailedError([
          {
            path: 'pickup.lat',
            message: 'Latitude must be between -90 and 90',
          },
        ]),
        host,
      );

      const { status, body } = captured();
      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(body.errors).toHaveLength(1);
      expect(body.errors?.[0]?.path).toBe('pickup.lat');
    });
  });

  describe('zod errors', () => {
    const schema = z.object({
      pickup: z.object({ lat: z.number().min(-90).max(90) }),
      vehicleType: z.enum(['BIKE', 'CNG', 'CAR']),
    });

    it('flattens issues into field errors with dotted paths', () => {
      const result = schema.safeParse({
        pickup: { lat: 200 },
        vehicleType: 'HELICOPTER',
      });
      expect(result.success).toBe(false);

      const { host, captured } = makeHost();
      devFilter.catch(result.error, host);

      const { status, body } = captured();
      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(body.code).toBe('VALIDATION_FAILED');

      const paths = body.errors?.map((error) => error.path) ?? [];
      expect(paths).toContain('pickup.lat');
      expect(paths).toContain('vehicleType');
    });
  });

  describe('framework exceptions', () => {
    it('maps a Nest NotFoundException (unknown route) to our shape', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new NotFoundException('Cannot GET /api/v1/nope'), host);

      const { status, body } = captured();
      expect(status).toBe(HttpStatus.NOT_FOUND);
      expect(body.code).toBe('NOT_FOUND');
      expect(body.type).toBe('https://cholojai.app/errors/not-found');
    });

    it('maps an unmapped status without crashing', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new HttpException('Teapot', 418), host);
      expect(captured().status).toBe(418);
      expect(captured().body.title).toBe('Request failed');
    });
  });

  describe('unexpected errors', () => {
    it('returns 500 for an unrecognised throw', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new Error('connection to 10.0.0.5:5432 refused'), host);

      const { status, body } = captured();
      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('NEVER leaks the exception message in production', () => {
      // The single most important assertion in this file. Exception text
      // routinely contains connection strings, file paths, and SQL —
      // exactly what an attacker probing endpoints is reading for.
      const { host, captured } = makeHost();
      prodFilter.catch(
        new Error('postgresql://admin:hunter2@10.0.0.5:5432/cholojai failed'),
        host,
      );

      const { body } = captured();
      expect(body.detail).not.toContain('hunter2');
      expect(body.detail).not.toContain('10.0.0.5');
      expect(body.detail).not.toContain('postgresql');
      expect(body.detail).toContain('request id');
    });

    it('does surface the message in development', () => {
      const { host, captured } = makeHost();
      devFilter.catch(new Error('something specific broke'), host);
      expect(captured().body.detail).toContain('something specific broke');
    });

    it('survives a non-Error being thrown', () => {
      const { host, captured } = makeHost();
      devFilter.catch('a bare string', host);
      expect(captured().status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured().body.detail).toContain('a bare string');
    });

    it('survives null being thrown', () => {
      const { host, captured } = makeHost();
      expect(() => devFilter.catch(null, host)).not.toThrow();
      expect(captured().status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('log severity', () => {
    it('logs 5xx at error level — someone must act on our bug', () => {
      const { host } = makeHost();
      devFilter.catch(new Error('boom'), host);

      expect(errorSpy).toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('logs 4xx at warn level — expected traffic is not an incident', () => {
      // A failed login or a 404 is the caller's mistake, not an outage.
      // Logging stacks for them turns the error log into noise nobody reads.
      const { host } = makeHost();
      devFilter.catch(new ResourceNotFoundError('ride'), host);

      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
