import { describe, expect, it } from '@jest/globals';

import { buildVerificationEmail } from './auth-email.templates';

describe('buildVerificationEmail', () => {
  const verifyUrl =
    'http://localhost:3000/verify-email?token=abc123def456ghi789jkl';

  const message = buildVerificationEmail('nabila@example.com', {
    fullName: 'Nabila Rahman',
    verifyUrl,
    expiresInHours: 24,
  });

  it('addresses the recipient', () => {
    expect(message.to).toBe('nabila@example.com');
    expect(message.text).toContain('Nabila Rahman');
  });

  it('includes the verification link in the plain-text body', () => {
    // Some clients render nothing but text, and some users disable HTML.
    // A link that exists only inside an <a> tag is unclickable for them.
    expect(message.text).toContain(verifyUrl);
  });

  it('includes the verification link in the HTML body', () => {
    expect(message.html).toContain(verifyUrl);
  });

  it('states the expiry and single use', () => {
    expect(message.text).toContain('24 hours');
    expect(message.text).toMatch(/once/u);
  });

  it('reassures someone who did not sign up', () => {
    // A stranger receiving this must understand that ignoring it is safe
    // and that no account activates without their action.
    expect(message.text).toMatch(/didn't create/u);
  });

  describe('HTML escaping', () => {
    it('escapes a name containing markup', () => {
      // `fullName` comes straight from a registration form, so it is
      // attacker-controlled. Interpolated raw, this would be XSS delivered
      // by email.
      const malicious = buildVerificationEmail('attacker@evil.test', {
        fullName: '<img src=x onerror="alert(1)">',
        verifyUrl,
        expiresInHours: 24,
      });

      // Assert the property that actually matters: the input never becomes
      // a *tag*. Checking for the substring `onerror=` would fail on
      // correctly-escaped output — `&lt;img src=x onerror=&quot;…&quot;`
      // still contains those characters, inertly, as text. A security test
      // that flags safe output is worse than no test: it trains people to
      // ignore the suite.
      expect(malicious.html).not.toContain('<img');
      expect(malicious.html).toContain('&lt;img');
      expect(malicious.html).toContain('&quot;alert(1)&quot;');
    });

    it('escapes quotes that could break out of an attribute', () => {
      const malicious = buildVerificationEmail('attacker@evil.test', {
        fullName: '" onmouseover="alert(1)',
        verifyUrl,
        expiresInHours: 24,
      });

      expect(malicious.html).not.toContain('onmouseover="alert');
      expect(malicious.html).toContain('&quot;');
    });

    it('escapes ampersands without double-encoding the rest', () => {
      const message = buildVerificationEmail('user@test.bd', {
        fullName: 'Rahman & Sons',
        verifyUrl,
        expiresInHours: 24,
      });

      expect(message.html).toContain('Rahman &amp; Sons');
    });
  });
});
