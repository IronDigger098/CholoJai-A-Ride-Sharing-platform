import { type NotificationKind } from '@cholojai/shared';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateNotificationInput,
  type NotificationPageRecord,
  type NotificationRecord,
  type NotificationRepository,
} from './notification-repository.port';

/** PostgreSQL adapter for {@link NotificationRepository}. */
@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(
    input: CreateNotificationInput,
  ): Promise<NotificationRecord> {
    const row = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
      },
    });

    return toRecord(row);
  }

  public async listForUser(
    userId: string,
    page: { readonly limit: number; readonly cursor?: string | undefined },
  ): Promise<NotificationPageRecord> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      /* Matches @@index([userId, createdAt(sort: Desc)]). `id` breaks ties
         so the cursor has a total order to seek on. */
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.cursor === undefined
        ? {}
        : { cursor: { id: page.cursor }, skip: 1 }),
    });

    return {
      notifications: rows.slice(0, page.limit).map(toRecord),
      hasNextPage: rows.length > page.limit,
    };
  }

  public async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  public async markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationRecord | null> {
    /* `updateMany` with the owner in the WHERE clause. `update` would need a
       read first to check whose it is, and a read-then-write is two chances
       to touch the wrong row. Already-read stays in scope so a second tap
       succeeds instead of reporting a phantom 404. */
    const changed = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });

    if (changed.count === 0) return null;

    const row = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    return row === null ? null : toRecord(row);
  }

  public async markAllRead(userId: string): Promise<number> {
    const changed = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return changed.count;
  }
}

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function toRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}
