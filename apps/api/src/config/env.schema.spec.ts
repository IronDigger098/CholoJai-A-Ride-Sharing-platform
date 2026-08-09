import { describe, expect, it } from '@jest/globals';

import { EnvValidationError, parseEnv } from './env.schema';

/** A minimal environment that satisfies every required field. */
const validEnv = {
  NODE_ENV: 'development',
  API_BASE_URL: 'http://localhost:4000',
  WEB_BASE_URL: 'http://localhost:3000',
  DATABASE_URL:
    'postgresql://cholojai:pw@localhost:5433/cholojai_dev?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-only-access-secret-thirty-two-chars-min',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'CholoJai <no-reply@cholojai.local>',
} as const;

describe('parseEnv', () => {
  describe('valid input', () => {
    it('accepts a complete environment', () => {
      expect(() => parseEnv(validEnv)).not.toThrow();
    });

    it('coerces numeric strings to numbers', () => {
      const env = parseEnv({ ...validEnv, PORT: '4000', SMTP_PORT: '1025' });
      expect(env.PORT).toBe(4000);
      expect(env.SMTP_PORT).toBe(1025);
      expect(typeof env.PORT).toBe('number');
    });

    it('applies defaults for optional variables', () => {
      const env = parseEnv(validEnv);
      expect(env.PORT).toBe(4000);
      expect(env.LOG_LEVEL).toBe('info');
      expect(env.RATE_LIMIT_GLOBAL_PER_MIN).toBe(100);
    });
  });

  describe('invalid input', () => {
    it('rejects a missing required variable', () => {
      const { DATABASE_URL: _omitted, ...withoutDatabase } = validEnv;
      expect(() => parseEnv(withoutDatabase)).toThrow(EnvValidationError);
    });

    it('rejects a non-PostgreSQL database URL', () => {
      expect(() =>
        parseEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/db' }),
      ).toThrow(/PostgreSQL/);
    });

    it('rejects a non-Redis cache URL', () => {
      expect(() =>
        parseEnv({ ...validEnv, REDIS_URL: 'http://localhost:6379' }),
      ).toThrow(/Redis/);
    });

    it('rejects a port outside the valid range', () => {
      expect(() => parseEnv({ ...validEnv, PORT: '70000' })).toThrow(
        EnvValidationError,
      );
      expect(() => parseEnv({ ...validEnv, PORT: '0' })).toThrow(
        EnvValidationError,
      );
    });

    it('rejects an unknown log level', () => {
      expect(() => parseEnv({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(
        EnvValidationError,
      );
    });

    it('rejects a malformed URL', () => {
      expect(() =>
        parseEnv({ ...validEnv, WEB_BASE_URL: 'localhost:3000' }),
      ).toThrow(EnvValidationError);
    });

    it('reports every problem at once, not just the first', () => {
      // One restart per broken variable is a miserable way to deploy.
      try {
        parseEnv({ ...validEnv, DATABASE_URL: 'nope', REDIS_URL: 'nope' });
        throw new Error('expected parseEnv to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(EnvValidationError);
        const { issues, message } = error as EnvValidationError;
        expect(issues.length).toBeGreaterThanOrEqual(2);
        expect(message).toContain('DATABASE_URL');
        expect(message).toContain('REDIS_URL');
      }
    });

    it('names the offending variable in the message', () => {
      expect(() => parseEnv({ ...validEnv, SMTP_PORT: 'abc' })).toThrow(
        /SMTP_PORT/,
      );
    });
  });

  describe('refresh-token policy', () => {
    it('rejects a sliding window longer than the absolute ceiling', () => {
      /* Not merely risky — incoherent. The clamp would silently ignore
         REFRESH_TTL_DAYS and expire every token at the ceiling, which gets
         diagnosed months later as "sessions feel wrong". */
      expect(() =>
        parseEnv({
          ...validEnv,
          REFRESH_TTL_DAYS: '60',
          REFRESH_ABSOLUTE_TTL_DAYS: '30',
        }),
      ).toThrow(EnvValidationError);
    });

    it('accepts a sliding window equal to the ceiling', () => {
      expect(() =>
        parseEnv({
          ...validEnv,
          REFRESH_TTL_DAYS: '30',
          REFRESH_ABSOLUTE_TTL_DAYS: '30',
        }),
      ).not.toThrow();
    });

    it('allows a grace window of zero, meaning strict reuse detection', () => {
      // Zero is a legitimate policy choice, not a missing value, so it must
      // survive validation rather than being coerced back to the default.
      const env = parseEnv({
        ...validEnv,
        REFRESH_ROTATION_GRACE_SECONDS: '0',
      });

      expect(env.REFRESH_ROTATION_GRACE_SECONDS).toBe(0);
    });

    it('defaults to a sliding week inside an absolute month', () => {
      const env = parseEnv(validEnv);

      expect(env.REFRESH_TTL_DAYS).toBe(7);
      expect(env.REFRESH_ABSOLUTE_TTL_DAYS).toBe(30);
      expect(env.REFRESH_ROTATION_GRACE_SECONDS).toBe(10);
    });
  });

  describe('production guards', () => {
    const productionEnv = {
      ...validEnv,
      NODE_ENV: 'production',
      API_BASE_URL: 'https://api.cholojai.app',
      WEB_BASE_URL: 'https://cholojai.app',
      LOG_LEVEL: 'info',
    } as const;

    it('accepts a correct production environment', () => {
      expect(() => parseEnv(productionEnv)).not.toThrow();
    });

    it('rejects plain http origins in production', () => {
      expect(() =>
        parseEnv({ ...productionEnv, WEB_BASE_URL: 'http://cholojai.app' }),
      ).toThrow(/https in production/);
    });

    it('rejects debug logging in production', () => {
      // Debug logs routinely contain request bodies — tokens, emails,
      // passwords in flight. This must not be a deploy-time choice.
      expect(() => parseEnv({ ...productionEnv, LOG_LEVEL: 'debug' })).toThrow(
        /production/,
      );
    });

    it('allows http origins outside production', () => {
      expect(() =>
        parseEnv({ ...validEnv, NODE_ENV: 'development' }),
      ).not.toThrow();
    });
  });
});
