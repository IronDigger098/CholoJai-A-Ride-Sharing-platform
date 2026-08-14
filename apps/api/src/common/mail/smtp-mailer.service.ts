import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { AppConfigService } from '../../config/app-config.service';

import { type EmailMessage, type Mailer } from './mailer.port';

/**
 * SMTP adapter for {@link Mailer}.
 *
 * In development this points at Mailpit, which accepts everything and shows
 * it in a web inbox at http://localhost:8025 — so verification and reset
 * flows can be clicked through end to end without a single real message
 * escaping the machine. Production points the same adapter at a real
 * provider; nothing else changes.
 */
@Injectable()
export class SmtpMailerService implements Mailer, OnModuleDestroy {
  private readonly logger = new Logger(SmtpMailerService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  public constructor(config: AppConfigService) {
    const { host, port, from, auth } = config.mail;
    this.from = from;

    this.transporter = createTransport({
      host,
      port,
      /* Spread rather than passed as a possibly-undefined property.
         Nodemailer reads the presence of `auth` as "authenticate", so an
         object full of undefined values makes it attempt AUTH with an empty
         username — which Mailpit, wanting none, refuses. */
      ...(auth === undefined ? {} : { auth }),
      // Mailpit speaks plain SMTP on 1025 with no TLS and no auth. A real
      // provider on 465/587 negotiates TLS, which nodemailer derives from
      // the port — hence no hardcoded `secure` flag.
      secure: port === 465,
      // Never fail a send because a local dev server has a self-signed
      // certificate. Production ports use real certificates and this has
      // no effect there.
      tls: { rejectUnauthorized: config.isProduction },
    });
  }

  /**
   * Send a message.
   *
   * Throws on failure rather than swallowing it. Whether a failed email
   * should fail the surrounding operation is a *caller's* decision: a
   * registration probably should not be rolled back because SMTP hiccuped,
   * but a password reset that silently sends nothing leaves a user stuck.
   * A transport that hides errors takes that choice away from everyone.
   */
  public async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
    });

    // Log the recipient and subject, never the body — verification and
    // reset emails contain single-use tokens, and a log line is the last
    // place a working credential should end up.
    this.logger.log(`Sent "${message.subject}" to ${message.to}`);
  }

  public onModuleDestroy(): void {
    this.transporter.close();
  }
}
