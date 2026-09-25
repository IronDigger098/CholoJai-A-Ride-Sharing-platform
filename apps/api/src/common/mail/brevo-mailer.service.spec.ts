import { describe, expect, it, jest } from '@jest/globals';

import { BrevoMailerService, parseSender } from './brevo-mailer.service';

describe('parseSender', () => {
  it('splits a display name from its address', () => {
    expect(parseSender('CholoJai <rides@example.com>')).toEqual({
      name: 'CholoJai',
      email: 'rides@example.com',
    });
  });

  it('drops quotes around the name', () => {
    expect(parseSender('"CholoJai" <rides@example.com>')).toEqual({
      name: 'CholoJai',
      email: 'rides@example.com',
    });
  });

  it('uses a bare address as its own name', () => {
    expect(parseSender('rides@example.com')).toEqual({
      name: 'rides@example.com',
      email: 'rides@example.com',
    });
  });
});

describe('BrevoMailerService', () => {
  const message = {
    to: 'rider@example.com',
    subject: 'Confirm your email',
    text: 'plain',
    html: '<p>html</p>',
  };

  it('posts the message to Brevo with the API key', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(new Response('{"messageId":"x"}', { status: 201 })),
    );
    const mailer = new BrevoMailerService(
      'key-123',
      'CholoJai <rides@example.com>',
      fetchImpl,
    );

    await mailer.send(message);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('key-123');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'CholoJai', email: 'rides@example.com' },
      to: [{ email: 'rider@example.com' }],
      subject: 'Confirm your email',
      textContent: 'plain',
      htmlContent: '<p>html</p>',
    });
  });

  it('throws when Brevo refuses, so the caller decides what that means', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(
        new Response('{"message":"sender not verified"}', { status: 400 }),
      ),
    );
    const mailer = new BrevoMailerService(
      'key',
      'rides@example.com',
      fetchImpl,
    );

    await expect(mailer.send(message)).rejects.toThrow(
      /400.*sender not verified/u,
    );
  });
});
