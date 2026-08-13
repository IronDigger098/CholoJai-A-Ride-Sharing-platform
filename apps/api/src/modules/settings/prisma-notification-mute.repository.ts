import { type NotificationKind } from '@cholojai/shared';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { type NotificationMuteRepository } from './notification-mute-repository.port';

/** PostgreSQL adapter for {@link NotificationMuteRepository}. */
@Injectable()
export class PrismaNotificationMuteRepository implements NotificationMuteRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async listMuted(userId: string): Promise<readonly NotificationKind[]> {
    const rows = await this.prisma.notificationMute.findMany({
      where: { userId },
      select: { kind: true },
    });

    /* No cast. Prisma generates its enum from the same schema the shared
       contract mirrors, so the two are the same union and TypeScript can
       see it — an assertion here would be noise that also hid the day they
       stopped agreeing. */
    return rows.map((row) => row.kind);
  }

  /**
   * Delete everything, insert what was asked for, in one transaction.
   *
   * Blunt, and right at this size: a person has at most a handful of mutes,
   * so computing a minimal diff would be more code than it saves. The
   * transaction is what matters — a failure between the delete and the
   * insert would leave somebody subscribed to everything they had just
   * turned off, which is the one outcome this feature exists to prevent.
   */
  public async replace(
    userId: string,
    muted: readonly NotificationKind[],
  ): Promise<readonly NotificationKind[]> {
    await this.prisma.$transaction(async (tx) => {
      await tx.notificationMute.deleteMany({ where: { userId } });

      if (muted.length === 0) return;

      await tx.notificationMute.createMany({
        data: muted.map((kind) => ({ userId, kind })),
        /* The unique index makes a duplicated kind in the request harmless
           rather than a 500. A client sending the same switch twice has
           expressed one intention. */
        skipDuplicates: true,
      });
    });

    return this.listMuted(userId);
  }

  public async isMuted(
    userId: string,
    kind: NotificationKind,
  ): Promise<boolean> {
    const mute = await this.prisma.notificationMute.findUnique({
      where: { userId_kind: { userId, kind } },
      select: { id: true },
    });

    return mute !== null;
  }
}
