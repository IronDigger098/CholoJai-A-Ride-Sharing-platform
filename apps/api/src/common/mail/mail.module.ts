import { Global, Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';

import { BrevoMailerService } from './brevo-mailer.service';
import { MAILER, type Mailer } from './mailer.port';
import { SmtpMailerService } from './smtp-mailer.service';

/**
 * Binds the mailer port to an adapter, chosen by configuration.
 *
 * Brevo's HTTP API when BREVO_API_KEY is set, SMTP otherwise. Nothing that
 * sends mail knows which — the port is the whole point.
 *
 * Global because sending mail is cross-cutting — auth, notifications, and
 * (later) receipts all need it, and threading an import through every one
 * of them adds ceremony without preventing anything.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Mailer => {
        const transport = config.mailTransport;

        return transport.kind === 'brevo'
          ? new BrevoMailerService(transport.apiKey, transport.from)
          : new SmtpMailerService(config);
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
