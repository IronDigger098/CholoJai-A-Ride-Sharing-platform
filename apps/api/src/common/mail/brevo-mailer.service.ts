import { Logger } from '@nestjs/common';

import { type EmailMessage, type Mailer } from './mailer.port';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

/** Give up on a send rather than hold the request that triggered it. */
const BREVO_TIMEOUT_MS = 10_000;

/**
 * Split `Name <address>` into its parts. A bare address is its own name.
 *
 * Brevo wants the sender as `{ name, email }`, while MAIL_FROM keeps the
 * RFC 5322 form every SMTP provider accepts, so the one variable serves
 * both transports.
 */
export function parseSender(from: string): { name: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/u.exec(from);

  if (match === null) return { name: from.trim(), email: from.trim() };

  const [, name = '', email = ''] = match;
  const address = email.trim();

  return { name: name.replace(/^"|"$/gu, '') || address, email: address };
}

/**
 * {@link Mailer} over Brevo's transactional-email HTTP API.
 *
 * HTTPS on port 443 rather than SMTP, because some hosts — Render's free
 * tier among them — block outbound SMTP entirely. The sender address has
 * to be verified in Brevo once; after that, no domain of our own is needed.
 *
 * Constructed by `MailModule`'s factory, not by the container: its inputs
 * are configuration values, not providers.
 */
export class BrevoMailerService implements Mailer {
  private readonly logger = new Logger(BrevoMailerService.name);
  private readonly sender: { name: string; email: string };

  public constructor(
    private readonly apiKey: string,
    from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.sender = parseSender(from);
  }

  /**
   * Send a message. Throws on failure, for the same reason the SMTP adapter
   * does: whether a failed email fails the operation is the caller's call.
   */
  public async send(message: EmailMessage): Promise<void> {
    const response = await this.fetchImpl(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: this.sender,
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html === undefined ? {} : { htmlContent: message.html }),
      }),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    });

    if (!response.ok) {
      /* The body is Brevo's error description — safe to surface, it holds
         no part of the message. The message itself carries single-use
         tokens and is never logged. */
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Brevo refused the message (${String(response.status)}): ${detail.slice(0, 300)}`,
      );
    }

    this.logger.log(`Sent "${message.subject}" to ${message.to}`);
  }
}
