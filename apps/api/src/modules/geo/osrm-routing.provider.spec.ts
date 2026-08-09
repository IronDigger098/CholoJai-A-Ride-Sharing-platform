import { afterEach, describe, expect, it } from '@jest/globals';

import { makeTestConfig } from '../../testing/env.fixture';

import { RouteNotFoundError, RoutingUnavailableError } from './geo.errors';
import { OsrmRoutingProvider } from './osrm-routing.provider';

/**
 * The adapter is the only file that knows OSRM exists, so it is the only
 * place these assertions can live. Everything here is about the boundary:
 * what we send, and what we do with each shape of answer.
 */

const PICKUP = { lat: 23.7461, lng: 90.376 };
const DROPOFF = { lat: 23.7936, lng: 90.4043 };

/**
 * Install a fetch that answers with `body`, and hand back the recorded calls
 * so a test can assert on the URL we built.
 *
 * Typed through the returned array rather than through `jest.Mock`, which
 * `@jest/globals` does not export as a type — the generic mock type it does
 * expose has to be spelled out in full, and this is shorter and clearer.
 */
const mockFetch = (
  body: unknown,
  init: { status?: number } = {},
): { urls: string[] } => {
  const urls: string[] = [];

  /* `string | URL` rather than `RequestInfo`: the latter is a DOM type that
     is not global in this app's TS configuration, so it resolves to `any`
     and no-redundant-type-constituents rejects the union. The cast below
     reconciles the narrower parameter with fetch's real signature, and the
     only thing done with the argument is read its URL. */
  globalThis.fetch = ((input: string | URL) => {
    urls.push(String(input));
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: init.status ?? 200 }),
    );
  }) as unknown as typeof fetch;

  return { urls };
};

describe('OsrmRoutingProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends coordinates in OSRM’s lng,lat order', async () => {
    /* OSRM takes lng,lat — the opposite of almost every other API and of
       how a human writes a coordinate. Getting it backwards does not error;
       it silently measures a route somewhere else entirely, and the fare
       that comes back looks perfectly reasonable. This assertion is the
       only thing standing between that bug and production. */
    const { urls } = mockFetch({
      code: 'Ok',
      routes: [{ distance: 8400, duration: 660 }],
    });

    await new OsrmRoutingProvider(makeTestConfig()).route(PICKUP, DROPOFF);

    expect(urls[0]).toContain('90.376,23.7461;90.4043,23.7936');
  });

  it('rounds distance and duration to integers', async () => {
    /* OSRM reports floats. estimateFare takes metres and seconds, and a
       fractional metre multiplied by a per-km rate reintroduces exactly the
       rounding drift that integer paisa exists to prevent. */
    mockFetch({
      code: 'Ok',
      routes: [{ distance: 8399.6, duration: 660.4 }],
    });

    const route = await new OsrmRoutingProvider(makeTestConfig()).route(
      PICKUP,
      DROPOFF,
    );

    expect(route).toEqual({ distanceMetres: 8400, durationSeconds: 660 });
  });

  it('reports NoRoute as a route failure, not an outage', async () => {
    /* 422, because retrying will never help — there is no road. Reporting
       it as unavailable would have the client back off and try again
       forever against an answer that cannot change. */
    mockFetch({ code: 'NoRoute' });

    await expect(
      new OsrmRoutingProvider(makeTestConfig()).route(PICKUP, DROPOFF),
    ).rejects.toBeInstanceOf(RouteNotFoundError);
  });

  it('reports an HTTP failure as unavailable', async () => {
    mockFetch({}, { status: 502 });

    await expect(
      new OsrmRoutingProvider(makeTestConfig()).route(PICKUP, DROPOFF),
    ).rejects.toBeInstanceOf(RoutingUnavailableError);
  });

  it('reports a network failure as unavailable', async () => {
    globalThis.fetch = () => Promise.reject(new Error('ECONNREFUSED'));

    await expect(
      new OsrmRoutingProvider(makeTestConfig()).route(PICKUP, DROPOFF),
    ).rejects.toBeInstanceOf(RoutingUnavailableError);
  });

  it('reports an unrecognised body as unavailable rather than trusting it', async () => {
    /* A provider outage that returns an HTML error page is the realistic
       case. Casting the response instead of parsing it would turn that into
       `undefined.distance` several layers away, and the symptom would be a
       fare of NaN rather than "routing is down". */
    mockFetch({ code: 'Ok', routes: [{ distance: 'eight thousand' }] });

    await expect(
      new OsrmRoutingProvider(makeTestConfig()).route(PICKUP, DROPOFF),
    ).rejects.toBeInstanceOf(RoutingUnavailableError);
  });

  it('does not leak the upstream error into the response detail', async () => {
    /* An upstream message can carry a URL, an API key, or an internal
       hostname. It belongs in the logs and in `cause`, never in a body a
       client reads. */
    globalThis.fetch = () =>
      Promise.reject(new Error('connect ECONNREFUSED 10.0.3.14:5000'));

    const error = await new OsrmRoutingProvider(makeTestConfig())
      .route(PICKUP, DROPOFF)
      .catch((caught: unknown) => caught);

    expect(String((error as Error).message)).not.toContain('10.0.3.14');
  });
});
