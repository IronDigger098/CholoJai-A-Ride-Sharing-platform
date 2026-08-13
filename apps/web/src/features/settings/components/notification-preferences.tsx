'use client';

import {
  MUTABLE_NOTIFICATION_KINDS,
  type NotificationKind,
  NOTIFICATION_KIND_LABEL,
} from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode } from 'react';

import { getNotificationSettings, updateNotificationSettings } from '../api';

import { toApiError } from '@/lib/api-error';

/**
 * Which notifications a rider is willing to receive.
 *
 * The switches read positively — "on" means send — while the wire carries
 * mutes. Inverting here rather than in the contract is deliberate: a person
 * thinks in terms of what they want, and the database stores exceptions so
 * that a category added next year is on for everybody. Both are right for
 * their side, and this component is the seam.
 *
 * Ride events are absent rather than shown-and-disabled. A switch that
 * cannot move is a question the product is refusing to answer; leaving them
 * out says what is true — these are not optional.
 */
export function NotificationPreferences(): ReactNode {
  const queryClient = useQueryClient();

  const { data, error, isPending } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: getNotificationSettings,
  });

  const save = useMutation({
    mutationFn: updateNotificationSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(['notification-settings'], settings);
    },
  });

  /* Optimistic in the only sense that matters: the switch is drawn from the
     pending set while a save is in flight, so it moves under the finger
     rather than snapping back a moment later. */
  const muted = save.variables?.muted ?? data?.muted ?? [];

  function toggle(kind: NotificationKind, wanted: boolean): void {
    const next = wanted
      ? muted.filter((entry) => entry !== kind)
      : [...muted, kind];

    save.mutate({ muted: next });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Notifications</h2>

      <p className="text-content-muted text-sm">
        Ride updates always arrive — that is how you know your driver is on the
        way. Everything below is yours to choose.
      </p>

      {isPending && (
        <p role="status" className="text-content-muted text-sm">
          Loading…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-danger text-sm">
          {toApiError(error).message}
        </p>
      )}

      {save.error !== null && (
        <p role="alert" className="text-danger text-sm">
          {toApiError(save.error).message}
        </p>
      )}

      {!isPending && (
        <ul className="space-y-2">
          {MUTABLE_NOTIFICATION_KINDS.map((kind) => {
            const enabled = !muted.includes(kind);

            return (
              <li key={kind}>
                <label className="border-border-strong flex cursor-pointer items-center justify-between gap-4 rounded-md border px-4 py-3 text-sm">
                  {NOTIFICATION_KIND_LABEL[kind]}

                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={save.isPending}
                    onChange={(event) => {
                      toggle(kind, event.target.checked);
                    }}
                    className="accent-accent size-4"
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
