import {
  type CreateNotificationInput,
  type NotificationPageRecord,
  type NotificationRecord,
  type NotificationRepository,
} from '../modules/notifications/notification-repository.port';

/**
 * In-memory {@link NotificationRepository}.
 *
 * Ownership is enforced here as it is in the adapter: `markRead` matches on
 * the user as well as the id. A fake that trusted the id would let a test
 * pass against a service that reads other people's notifications.
 */
export class InMemoryNotificationRepository implements NotificationRepository {
  public readonly rows: (NotificationRecord & { userId: string })[] = [];
  private sequence = 0;

  public async create(
    input: CreateNotificationInput,
  ): Promise<NotificationRecord> {
    const record = {
      id: `notification_${++this.sequence}`,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      readAt: null,
      /* Distinct per row, so "newest first" is a real ordering rather than
         insertion order wearing a timestamp. */
      createdAt: new Date(Date.UTC(2026, 7, 10, 0, 0, this.sequence)),
    };

    this.rows.push(record);
    return record;
  }

  public async listForUser(
    userId: string,
    page: { readonly limit: number; readonly cursor?: string | undefined },
  ): Promise<NotificationPageRecord> {
    const mine = this.rows
      .filter((row) => row.userId === userId)
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );

    const start =
      page.cursor === undefined
        ? 0
        : mine.findIndex((row) => row.id === page.cursor) + 1;

    return {
      notifications: mine.slice(start, start + page.limit),
      hasNextPage: mine.length > start + page.limit,
    };
  }

  public async countUnread(userId: string): Promise<number> {
    return this.rows.filter(
      (row) => row.userId === userId && row.readAt === null,
    ).length;
  }

  public async markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationRecord | null> {
    const index = this.rows.findIndex(
      (row) => row.id === notificationId && row.userId === userId,
    );
    const existing = this.rows[index];

    if (existing === undefined) return null;

    const updated = { ...existing, readAt: existing.readAt ?? new Date() };
    this.rows[index] = updated;

    return updated;
  }

  public async markAllRead(userId: string): Promise<number> {
    let changed = 0;

    this.rows.forEach((row, index) => {
      if (row.userId !== userId || row.readAt !== null) return;

      this.rows[index] = { ...row, readAt: new Date() };
      changed += 1;
    });

    return changed;
  }
}
