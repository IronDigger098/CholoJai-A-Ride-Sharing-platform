import { describe, expect, it } from '@jest/globals';

import {
  emailSchema,
  passwordSchema,
  phoneSchema,
  registerRequestSchema,
} from './auth.contracts';

describe('emailSchema', () => {
  it('lowercases so casing cannot create two accounts', () => {
    // Without this, the database's unique index (case-sensitive) would
    // happily accept Nabila@Example.com alongside nabila@example.com.
    expect(emailSchema.parse('Nabila@Example.COM')).toBe('nabila@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(emailSchema.parse('  rafiq@test.bd  ')).toBe('rafiq@test.bd');
  });

  it('rejects malformed addresses', () => {
    for (const invalid of ['not-an-email', '@example.com', 'user@', '']) {
      expect(emailSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('rejects an address beyond the RFC 5321 limit', () => {
    const tooLong = `${'a'.repeat(250)}@example.com`;
    expect(emailSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a long passphrase', () => {
    expect(
      passwordSchema.safeParse('correct horse battery staple').success,
    ).toBe(true);
  });

  it('rejects anything shorter than 12 characters', () => {
    expect(passwordSchema.safeParse('short123').success).toBe(false);
    expect(passwordSchema.safeParse('elevenchar!').success).toBe(false);
    expect(passwordSchema.safeParse('twelvechars!').success).toBe(true);
  });

  it('does NOT demand mixed case, digits, or symbols', () => {
    // NIST SP 800-63B advises against composition rules: they push users
    // toward predictable substitutions like Password1! while blocking
    // genuinely strong passphrases. Length carries the strength.
    expect(passwordSchema.safeParse('thequickbrownfoxjumps').success).toBe(
      true,
    );
  });

  it('caps length as a denial-of-service guard', () => {
    // Argon2's cost grows with input size; an unbounded password field is
    // an unbounded amount of work per request.
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('normalises every common format to one canonical form', () => {
    for (const input of [
      '01712345678',
      '+8801712345678',
      '8801712345678',
      '  01712345678  ',
    ]) {
      expect(phoneSchema.parse(input)).toBe('+8801712345678');
    }
  });

  it('accepts every valid Bangladeshi operator prefix', () => {
    for (const prefix of ['013', '014', '015', '016', '017', '018', '019']) {
      expect(phoneSchema.safeParse(`${prefix}12345678`).success).toBe(true);
    }
  });

  it('rejects invalid numbers', () => {
    for (const invalid of [
      '0121234567', // 012 is not an allocated prefix
      '0171234567', // too short
      '017123456789', // too long
      '1712345678', // missing leading zero
      'not-a-number',
    ]) {
      expect(phoneSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe('registerRequestSchema', () => {
  const valid = {
    fullName: 'Nabila Rahman',
    email: 'nabila@example.com',
    password: 'a-long-enough-passphrase',
  };

  it('accepts a minimal valid registration', () => {
    expect(registerRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('treats phone as optional', () => {
    const result = registerRequestSchema.parse(valid);
    expect(result.phone).toBeUndefined();
  });

  it('normalises email and phone together', () => {
    const result = registerRequestSchema.parse({
      ...valid,
      email: '  Nabila@EXAMPLE.com ',
      phone: '01712345678',
    });
    expect(result.email).toBe('nabila@example.com');
    expect(result.phone).toBe('+8801712345678');
  });

  it('reports every invalid field at once, not just the first', () => {
    // The client renders all of them inline; one-at-a-time validation
    // makes a form feel like an interrogation.
    const result = registerRequestSchema.safeParse({
      fullName: 'A',
      email: 'nope',
      password: 'short',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path.join('.'));
      expect(fields).toContain('fullName');
      expect(fields).toContain('email');
      expect(fields).toContain('password');
    }
  });

  it('rejects unknown fields silently by stripping them', () => {
    // Zod strips by default. A client sending `isAdmin: true` gets it
    // discarded rather than reaching a service that might trust it.
    // No type assertion needed — `parse` accepts `unknown` by design,
    // which is the whole point of a runtime validator.
    const result = registerRequestSchema.parse({
      ...valid,
      isAdmin: true,
      roles: ['ADMIN'],
    });

    expect(result).not.toHaveProperty('isAdmin');
    expect(result).not.toHaveProperty('roles');
  });
});
