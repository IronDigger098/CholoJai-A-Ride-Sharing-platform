import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type ContactMessagePageResult,
  type ContactMessageRecord,
  type ContactMessageRepository,
  type CreateContactMessageInput,
  type ListContactMessagesOptions,
} from './contact-repository.port';

/** PostgreSQL adapter for {@link ContactMessageRepository}. */
@Injectable()
export class PrismaContactMessageRepository implements ContactMessageRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(
    input: CreateContactMessageInput,
  ): Promise<ContactMessageRecord> {
    return this.prisma.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
        userId: input.userId ?? null,
      },
    });
  }

  /**
   * One page of the inbox.
   *
   * `take: limit + 1` asks for one row more than the caller wants; its
   * presence is what "there is a next page" means, and it costs nothing
   * beside a second `COUNT(*)` over the same predicate.
   *
   * Ascending, unlike every other list here. The `(handled_at, created_at)`
   * index serves it either way, and oldest-first is what stops a message
   * that has waited a fortnight from sinking below a page nobody opens.
   *
   * `id` tiebreaks the sort. Cursor pagination needs a total order: two
   * messages written in the same millisecond could otherwise swap places
   * between requests, and the reader would see one twice and miss the other.
   */
  public async list(
    options: ListContactMessagesOptions,
  ): Promise<ContactMessagePageResult> {
    const rows = await this.prisma.contactMessage.findMany({
      where: options.handled
        ? { handledAt: { not: null } }
        : { handledAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: options.limit + 1,
      ...(options.cursor === undefined
        ? {}
        : { cursor: { id: options.cursor }, skip: 1 }),
    });

    return {
      messages: rows.slice(0, options.limit),
      hasNextPage: rows.length > options.limit,
    };
  }

  /**
   * Set or clear the handled timestamp.
   *
   * `updateMany` rather than `update`, so an unknown id is zero rows instead
   * of an exception — the controller turns that into a 404 with a sentence
   * of its own.
   */
  public async setHandled(
    messageId: string,
    handledAt: Date | null,
  ): Promise<ContactMessageRecord | null> {
    const changed = await this.prisma.contactMessage.updateMany({
      where: { id: messageId },
      data: { handledAt },
    });

    if (changed.count === 0) return null;

    return this.prisma.contactMessage.findUnique({ where: { id: messageId } });
  }
}
