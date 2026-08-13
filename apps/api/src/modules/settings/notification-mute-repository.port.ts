import { type NotificationKind } from '@cholojai/shared';

/**
 * What the settings feature needs from persistence.
 *
 * Only the exceptions are stored. `listMuted` returns the categories a
 * person has switched off; everything absent from that list is on. A kind
 * added after somebody last touched their settings is therefore enabled for
 * them, which is the only defensible default for something they have never
 * been asked about.
 */
export interface NotificationMuteRepository {
  listMuted(userId: string): Promise<readonly NotificationKind[]>;

  /**
   * Make the stored set exactly `muted`.
   *
   * Replace rather than add-and-remove, because the caller sends the whole
   * set: a settings screen submits what the switches now say, and computing
   * the difference on this side means one round trip instead of asking the
   * client to send two lists it would have to derive anyway.
   */
  replace(
    userId: string,
    muted: readonly NotificationKind[],
  ): Promise<readonly NotificationKind[]>;

  /**
   * Is this person willing to hear about this?
   *
   * Asked on the notification path, so it is a single indexed lookup rather
   * than reading the whole set. False only when a matching mute exists.
   */
  isMuted(userId: string, kind: NotificationKind): Promise<boolean>;
}

export const NOTIFICATION_MUTE_REPOSITORY = Symbol(
  'NOTIFICATION_MUTE_REPOSITORY',
);
