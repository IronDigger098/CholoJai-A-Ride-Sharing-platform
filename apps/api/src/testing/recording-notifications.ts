import {
  type NotificationsService,
  type NotifyInput,
} from '../modules/notifications/notifications.service';

/**
 * A `NotificationsService` that records instead of storing.
 *
 * Only `notify` is reachable from the services that raise events, so only
 * that is implemented — a fuller fake would be untested code pretending to
 * be a test double.
 *
 * Shared rather than written twice. Rides and drivers both publish, and two
 * private copies would be two places to update the day `notify` grows an
 * argument.
 */
export function makeRecordingNotifications(): {
  service: NotificationsService;
  sent: NotifyInput[];
} {
  const sent: NotifyInput[] = [];

  const service = {
    notify: (input: NotifyInput) => {
      sent.push(input);
      return Promise.resolve();
    },
  } as unknown as NotificationsService;

  return { service, sent };
}
