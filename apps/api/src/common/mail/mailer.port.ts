/**
 * What the application needs from an email transport.
 *
 * A port, for the same reasons as `DatabaseProbe` and `UserRepository`:
 * services depend on "something that can send mail", not on nodemailer, an
 * SMTP socket, or Resend's HTTP API. Swapping Mailpit for Resend in
 * production is a binding change in one module.
 *
 * The testing consequence is the one that matters day to day — a
 * registration test can assert "a verification email was sent to this
 * address with this link" without an SMTP server anywhere in sight.
 */

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  /** Plain-text body. Always sent — some clients render nothing else. */
  readonly text: string;
  /** HTML body. Optional; `text` is the fallback. */
  readonly html?: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');
