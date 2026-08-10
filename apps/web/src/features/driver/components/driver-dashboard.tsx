'use client';

import {
  canTransition,
  formatTaka,
  type Paisa,
  type Ride,
  RideStatus,
} from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { driverAction, type DriverAction, listOffers } from '../api';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Link } from '@/components/ui/link';
import { getActiveRide } from '@/features/rides/api';
import { usePublishLocation } from '@/features/tracking/use-ride-location';
import { toApiError } from '@/lib/api-error';

const EXACT = { withDecimals: true } as const;

/**
 * The one move available from each state a driver can be in.
 *
 * `Partial` rather than a full record, so statuses with no driver move —
 * REQUESTED, and every terminal one — are simply absent and the lookup
 * yields undefined without a cast.
 */
const NEXT_MOVE: Partial<
  Record<RideStatus, { action: DriverAction; to: RideStatus; label: string }>
> = {
  [RideStatus.ACCEPTED]: {
    action: 'arrive',
    to: RideStatus.ARRIVED,
    label: 'I have arrived',
  },
  [RideStatus.ARRIVED]: {
    action: 'start',
    to: RideStatus.IN_PROGRESS,
    label: 'Start the journey',
  },
  [RideStatus.IN_PROGRESS]: {
    action: 'complete',
    to: RideStatus.COMPLETED,
    label: 'Complete ride',
  },
};

/**
 * What a driver sees when they open the app.
 *
 * One screen with two states, not two screens: a driver either has a ride or
 * is looking for one, and which of those is true is the server's answer
 * rather than a route the driver picks.
 */
export function DriverDashboard(): ReactNode {
  const queryClient = useQueryClient();

  const { data: active, isPending: activePending } = useQuery({
    queryKey: ['rides', 'active'],
    queryFn: getActiveRide,
    /* Short, because the interesting change here comes from elsewhere — a
       rider cancelling. Until M7's Socket.IO slice this is how the screen
       finds out. */
    refetchInterval: 10_000,
  });

  const { data: offers = [], isPending: offersPending } = useQuery({
    queryKey: ['rides', 'offers'],
    queryFn: listOffers,
    enabled: active === null,
    refetchInterval: 10_000,
  });

  /* Publishes while there is a ride, stops when there is not. The hook is
     called unconditionally — hooks always are — and does nothing on null. */
  usePublishLocation(active?.id ?? null);

  const act = useMutation({
    mutationFn: ({
      rideId,
      action,
    }: {
      rideId: string;
      action: DriverAction;
    }) => driverAction(rideId, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rides'] });
    },
  });

  if (activePending) {
    return (
      <p role="status" className="text-content-muted text-sm">
        Loading…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {act.error !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {toApiError(act.error).message}
        </p>
      )}

      {active !== null && active !== undefined ? (
        <ActiveRide
          ride={active}
          busy={act.isPending}
          onAct={(action) => {
            act.mutate({ rideId: active.id, action });
          }}
        />
      ) : (
        <Offers
          offers={offers}
          loading={offersPending}
          busy={act.isPending}
          onAccept={(rideId) => {
            act.mutate({ rideId, action: 'accept' });
          }}
        />
      )}
    </div>
  );
}

function ActiveRide({
  ride,
  busy,
  onAct,
}: {
  ride: Ride;
  busy: boolean;
  onAct: (action: DriverAction) => void;
}): ReactNode {
  const next = NEXT_MOVE[ride.status];

  /* The button appears only when the state machine allows the move — the
     same RIDE_TRANSITIONS table the API enforces, so the screen can never
     offer something the server will refuse. */
  const allowed = next !== undefined && canTransition(ride.status, next.to);

  return (
    <section className="space-y-4">
      <p className="text-content-subtle text-xs tracking-widest uppercase">
        {ride.status}
      </p>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-content-subtle text-xs">Pickup</dt>
          <dd>{ride.pickupAddress}</dd>
        </div>
        <div>
          <dt className="text-content-subtle text-xs">Destination</dt>
          <dd>{ride.dropoffAddress}</dd>
        </div>
        <div>
          <dt className="text-content-subtle text-xs">Fare</dt>
          <dd className="tabular-nums">
            {formatTaka(ride.fare.total as Paisa, EXACT)}
          </dd>
        </div>
      </dl>

      {allowed && next !== undefined && (
        <Button
          variant="accent"
          disabled={busy}
          onClick={() => {
            onAct(next.action);
          }}
          className="w-full"
        >
          {busy ? 'Working…' : next.label}
        </Button>
      )}
    </section>
  );
}

function Offers({
  offers,
  loading,
  busy,
  onAccept,
}: {
  offers: readonly Ride[];
  loading: boolean;
  busy: boolean;
  onAccept: (rideId: string) => void;
}): ReactNode {
  if (loading) {
    return (
      <p role="status" className="text-content-muted text-sm">
        Looking for rides…
      </p>
    );
  }

  if (offers.length === 0) {
    return (
      <p className="text-content-muted text-sm">
        No rides waiting right now. This list refreshes on its own.{' '}
        <Link href="/drive/vehicles">Check your vehicle</Link> if you expect to
        see offers.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {offers.map((ride) => (
        <li
          key={ride.id}
          className="border-border-strong space-y-3 rounded-md border px-4 py-3"
        >
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {ride.pickupAddress}
              </span>
              <span className="text-content-subtle block truncate text-xs">
                to {ride.dropoffAddress}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {formatTaka(ride.fare.total as Paisa, EXACT)}
            </span>
          </div>

          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              onAccept(ride.id);
            }}
            className="w-full"
          >
            Accept
          </Button>
        </li>
      ))}
    </ul>
  );
}
