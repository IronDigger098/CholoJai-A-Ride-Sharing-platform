import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { type AppConfigService } from '../../config/app-config.service';

/** Where the interactive docs are served. */
export const SWAGGER_PATH = 'api/docs';

/**
 * The RFC 9457 error shape, registered once so every endpoint can reference
 * it instead of redeclaring the same fields.
 *
 * Written by hand rather than generated from a DTO class because
 * `ProblemDetails` lives in `packages/shared` as a plain interface — it is
 * consumed by the browser, where importing a decorated Nest class would
 * drag `@nestjs/swagger` into the frontend bundle. A small duplication that
 * buys a clean dependency boundary.
 */
const PROBLEM_DETAILS_SCHEMA = {
  type: 'object',
  required: ['type', 'title', 'status', 'code'],
  properties: {
    type: {
      type: 'string',
      format: 'uri',
      example: 'https://cholojai.app/errors/ride-already-accepted',
    },
    title: { type: 'string', example: 'Ride already accepted' },
    status: { type: 'integer', example: 409 },
    code: {
      type: 'string',
      example: 'RIDE_ALREADY_ACCEPTED',
      description:
        'Stable machine-readable identifier. The ONLY field a client may ' +
        'branch on — title and detail are human-facing and translated.',
    },
    detail: {
      type: 'string',
      example: 'This ride was accepted by another driver 4 seconds ago.',
    },
    instance: { type: 'string', example: '/api/v1/rides/clx7f2k9a0001' },
    requestId: {
      type: 'string',
      example: '3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071',
      description: 'Quote this when reporting a problem — it locates the logs.',
    },
    errors: {
      type: 'array',
      description: 'Present only on validation failures.',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', example: 'pickup.lat' },
          message: {
            type: 'string',
            example: 'Latitude must be between -90 and 90',
          },
        },
      },
    },
  },
};

/**
 * Mount interactive OpenAPI documentation.
 *
 * Generated from the code, never hand-written: documentation that is
 * derived cannot disagree with the routes that exist. `docs/api-design.md`
 * remains the *policy* (conventions, error semantics, pagination strategy);
 * this is the mechanical *reference*.
 *
 * Returns `false` when documentation is disabled, so the caller can log
 * accurately rather than advertise a URL that 404s.
 */
export function setupSwagger(
  app: INestApplication,
  config: AppConfigService,
): boolean {
  if (!config.swaggerEnabled) return false;

  const builder = new DocumentBuilder()
    .setTitle('CholoJai API')
    .setDescription(
      'Ride-sharing platform API.\n\n' +
        '**Errors** follow RFC 9457 problem details. Branch on `code`, ' +
        'never on `title` or `detail` — those are translated.\n\n' +
        '**Collections** are cursor-paginated and always wrapped in an ' +
        'object with `data` and `pageInfo`.\n\n' +
        '**Money** is always an integer count of paisa (1 BDT = 100 paisa), ' +
        'never a float.',
    )
    .setVersion('1.0')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer(config.apiBaseUrl, 'Current environment')
    /* Declared now so every protected endpoint added in M3 onward can
       reference it, and the "Authorize" button exists from the start. */
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived access token from POST /auth/login.',
      },
      'access-token',
    )
    .addTag('Health', 'Liveness and readiness probes')
    .addTag('Auth', 'Registration, sign-in, tokens, password reset')
    .addTag('Rides', 'Booking and the ride lifecycle')
    .addTag('Fares', 'Fare quotes and pricing')
    .addTag('Drivers', 'Driver profiles, availability, earnings')
    .addTag('Vehicles', 'Driver vehicle management')
    .addTag('Admin', 'Operations and moderation');

  const document = SwaggerModule.createDocument(app, builder.build());

  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ProblemDetails: PROBLEM_DETAILS_SCHEMA,
  };

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    // Keep the bearer token across page reloads — otherwise every refresh
    // means re-authorising, which makes the UI tedious enough to go unused.
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'CholoJai API Reference',
  });

  return true;
}
