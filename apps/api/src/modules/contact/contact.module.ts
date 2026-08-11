import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ContactMessagesController } from './contact-messages.controller';
import { CONTACT_MESSAGE_REPOSITORY } from './contact-repository.port';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { PrismaContactMessageRepository } from './prisma-contact-message.repository';

/**
 * Support messages.
 *
 * Two controllers, opposite audiences: `ContactController` is open to
 * anyone, `ContactMessagesController` is administrators only. Both talk to
 * one service, because "a message was written" and "a message was read" are
 * two views of the same table and splitting the service would give them two
 * definitions of what a message is.
 *
 * Imports `AuthModule` for both guards — the strict one for the inbox and
 * the optional one that links a signed-in sender to their account.
 */
@Module({
  imports: [AuthModule],
  controllers: [ContactController, ContactMessagesController],
  providers: [
    ContactService,
    {
      provide: CONTACT_MESSAGE_REPOSITORY,
      useClass: PrismaContactMessageRepository,
    },
  ],
  exports: [ContactService],
})
export class ContactModule {}
