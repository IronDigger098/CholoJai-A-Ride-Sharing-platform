import { describe, expect, it, jest } from '@jest/globals';
import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ProblemDetailsFilter } from '../../common/filters/problem-details.filter';

import { DATABASE_PROBE, type DatabaseProbe } from './database-probe';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Integration test: a real HTTP request through routing, the controller,
 * the service, and serialisation. Unlike a unit test, this catches a broken
 * route path, a wrong prefix, or a filter that failed to register.
 *
 * The controller and providers are declared directly rather than importing
 * `HealthModule`, because that module binds `DATABASE_PROBE` to the real
 * `PrismaService`. Substituting the probe here keeps this a test of routing
 * and response shaping — which is what it claims to be — instead of
 * quietly requiring a live database.
 */
describe('HealthController (integration)', () => {
  let app: INestApplication;

  /* Declare the mock first and build the probe around it, rather than
     pulling the method back off the object afterwards. Extracting a method
     from an object detaches it from its `this`, which is exactly what the
     unbound-method rule warns about — and here it is trivially avoidable. */
  const isReachable = jest.fn<() => Promise<boolean>>();
  const databaseProbe: DatabaseProbe = { isReachable };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: DATABASE_PROBE, useValue: databaseProbe },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // Mirror main.ts, so the test exercises the real routing rules rather
    // than a simplified arrangement that happens to pass.
    app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new ProblemDetailsFilter(false));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    isReachable.mockResolvedValue(true);
  });

  describe('GET /health', () => {
    it('responds 200 outside the version prefix', async () => {
      // Infrastructure must not need to know the API version.
      await request(app.getHttpServer()).get('/health').expect(200);
    });

    it('is NOT served under the versioned prefix', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(404);
    });

    it('reports status, uptime, timestamp and version', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.body).toMatchObject({ status: 'ok' });
      expect(typeof response.body.uptimeSeconds).toBe('number');
      expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(typeof response.body.version).toBe('string');
    });

    it('returns an ISO 8601 UTC timestamp', async () => {
      const response = await request(app.getHttpServer()).get('/health');
      expect(response.body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
      );
    });

    it('never consults the database', async () => {
      // Liveness must stay green while Postgres is down. If it did not, a
      // brief database blip would make the orchestrator restart every
      // healthy instance and turn a dependency outage into a total one.
      isReachable.mockClear();
      await request(app.getHttpServer()).get('/health').expect(200);
      expect(isReachable).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 and "ready" when the database answers', async () => {
      isReachable.mockResolvedValue(true);

      const response = await request(app.getHttpServer()).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ready',
        database: { status: 'up' },
      });
      expect(typeof response.body.database.latencyMs).toBe('number');
    });

    it('returns 503 and names the failing dependency when it is down', async () => {
      // 503 is what removes this instance from a load balancer's rotation.
      // The body still says WHICH dependency failed, so an operator does
      // not have to go digging through logs to find out.
      isReachable.mockResolvedValue(false);

      const response = await request(app.getHttpServer()).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        status: 'not_ready',
        database: { status: 'down' },
      });
    });

    it('stays outside the version prefix like liveness', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(404);
    });

    it('leaves liveness green while the database is down', async () => {
      // The whole point of separating the two probes.
      isReachable.mockResolvedValue(false);

      await request(app.getHttpServer()).get('/health/ready').expect(503);
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });

  describe('unknown routes', () => {
    it('returns an RFC 9457 problem details body', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/does-not-exist',
      );

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(response.body).toMatchObject({
        code: 'NOT_FOUND',
        status: 404,
        type: 'https://cholojai.app/errors/not-found',
      });
    });
  });
});
