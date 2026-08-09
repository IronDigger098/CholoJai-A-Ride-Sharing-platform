import { Global, Module } from '@nestjs/common';

import { MAILER } from './mailer.port';
import { SmtpMailerService } from './smtp-mailer.service';

/**
 * Binds the mailer port to its SMTP adapter.
 *
 * Global because sending mail is cross-cutting — auth, notifications, and
 * (later) receipts all need it, and threading an import through every one
 * of them adds ceremony without preventing anything.
 */
@Global()
@Module({
  providers: [{ provide: MAILER, useClass: SmtpMailerService }],
  exports: [MAILER],
})
export class MailModule {}
