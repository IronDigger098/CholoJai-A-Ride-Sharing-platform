import {
  type ContactMessage,
  type ContactMessageListQuery,
  type ContactMessagePage,
  type SubmitContactMessageRequest,
} from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import {
  CONTACT_MESSAGE_REPOSITORY,
  type ContactMessageRecord,
  type ContactMessageRepository,
} from './contact-repository.port';

/**
 * Messages to support, and the inbox that answers them.
 *
 * No notification is raised and no mail is sent. Both are things the product
 * has not decided — who receives support mail, and whether an auto-reply is
 * reassuring or noise — and inventing an answer here would make it a
 * decision nobody remembers making. The message is stored and the inbox is
 * readable, which is the whole of what was asked for.
 */
@Injectable()
export class ContactService {
  public constructor(
    @Inject(CONTACT_MESSAGE_REPOSITORY)
    private readonly messages: ContactMessageRepository,
  ) {}

  /**
   * Store a message from anyone.
   *
   * `senderId` is what the token said, when there was one. It is never
   * derived from the email: a stranger can type anybody's address, and an
   * account link built from an unverified string would attach a real person
   * to a message they did not send.
   */
  public async submit(
    request: SubmitContactMessageRequest,
    senderId: string | null,
  ): Promise<ContactMessage> {
    const record = await this.messages.create({
      name: request.name,
      email: request.email,
      subject: request.subject,
      message: request.message,
      ...(senderId === null ? {} : { userId: senderId }),
    });

    return toContactMessage(record);
  }

  public async list(
    query: ContactMessageListQuery,
  ): Promise<ContactMessagePage> {
    const { messages, hasNextPage } = await this.messages.list({
      handled: query.handled,
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });

    const data = messages.map(toContactMessage);

    return {
      data,
      pageInfo: {
        nextCursor: hasNextPage ? (data.at(-1)?.id ?? null) : null,
        hasNextPage,
      },
    };
  }

  /**
   * Mark one dealt with, or put it back.
   *
   * The timestamp is set here rather than in the adapter so that "handled"
   * means one moment across every implementation — a fake that used its own
   * clock would agree with the real one right up until a test asserted on
   * the value.
   */
  public async setHandled(
    messageId: string,
    handled: boolean,
  ): Promise<ContactMessage | null> {
    const record = await this.messages.setHandled(
      messageId,
      handled ? new Date() : null,
    );

    return record === null ? null : toContactMessage(record);
  }
}

function toContactMessage(record: ContactMessageRecord): ContactMessage {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    subject: record.subject,
    message: record.message,
    userId: record.userId,
    handledAt:
      record.handledAt === null ? null : record.handledAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}
