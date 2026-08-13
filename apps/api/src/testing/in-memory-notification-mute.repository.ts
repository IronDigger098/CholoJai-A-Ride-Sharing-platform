import { type NotificationKind } from '@cholojai/shared';

import { type NotificationMuteRepository } from '../modules/settings/notification-mute-repository.port';

/**
 * In-memory {@link NotificationMuteRepository}.
 *
 * Defaults to muting nothing, which is what the real table does for a
 * person who has never opened settings — so a suite that does not care
 * about mutes gets the behaviour it would have had before they existed.
 */
export class InMemoryNotificationMuteRepository implements NotificationMuteRepository {
  private readonly muted = new Map<string, Set<NotificationKind>>();

  public async listMuted(userId: string): Promise<readonly NotificationKind[]> {
    return [...(this.muted.get(userId) ?? [])];
  }

  public async replace(
    userId: string,
    muted: readonly NotificationKind[],
  ): Promise<readonly NotificationKind[]> {
    this.muted.set(userId, new Set(muted));

    return [...muted];
  }

  public async isMuted(
    userId: string,
    kind: NotificationKind,
  ): Promise<boolean> {
    return this.muted.get(userId)?.has(kind) ?? false;
  }
}
