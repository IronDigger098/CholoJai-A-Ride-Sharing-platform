'use client';

import {
  canTransition,
  formatTaka,
  type Paisa,
  RideStatus,
} from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cancelRide, getRide } from '../api';

import { RateRide } from './rate-ride';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { useRideLocation } from '@/features/tracking/use-ride-location';
import { toApiError } from '@/lib/api-error';

const EXACT = { withDecimals: true } as const;

export function RideDetail({ rideId }: { rideId: string }): ReactNode {
  const queryClient = useQueryClient();

  const {
    data: ride,
    isPending,
    error,
  } = useQuery({
    queryKey: ['ride', rideId],
    queryFn: () => getRide(rideId),
  });

  const driverPosition = useRideLocation(rideId);

  const cancel = useMutation({
    mutationFn: () => cancelRide(rideId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['ride', rideId], updated);
    },
  });

  if (isPending) {
    return (
      <p role="status" className="text-content-muted text-sm">
        Loading…
      </p>
    );
  }

  if (error !== null) {
    return (
      <p role="alert" className="text-danger text-sm">
        {toApiError(error).message}
      </p>
    );
  }

  /* The button exists only when the state machine allows the move, derived
     from the same RIDE_TRANSITIONS table the API enforces. Neither side
     hard-codes a status, so neither can drift from the other. */
  const cancellable = canTransition(ride.status, RideStatus.CANCELLED);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-content-subtle text-xs tracking-widest uppercase">
          {ride.status}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {formatTaka(ride.fare.total as Paisa, EXACT)}
        </h1>
      </div>

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
          <dt className="text-content-subtle text-xs">Vehicle</dt>
          <dd>{ride.vehicleType}</dd>
        </div>

        {/* Shown only once a position has arrived. "Waiting for the driver's
            location" on a ride nobody has accepted yet would be noise. */}
        {driverPosition !== null && (
          <div>
            <dt className="text-content-subtle text-xs">Driver position</dt>
            <dd className="tabular-nums" aria-live="polite">
              {driverPosition.lat.toFixed(5)}, {driverPosition.lng.toFixed(5)}
            </dd>
          </div>
        )}
      </dl>

      {cancel.error !== null && (
        <p role="alert" className="text-danger text-sm">
          {toApiError(cancel.error).message}
        </p>
      )}

      {cancellable && (
        <Button
          variant="ghost"
          onClick={() => {
            cancel.mutate();
          }}
          disabled={cancel.isPending}
        >
          {cancel.isPending ? 'Cancelling…' : 'Cancel ride'}
        </Button>
      )}

      {/* Only once the journey is over. A rating form on a ride in progress
          asks someone to judge something that has not happened yet, and the
          API would refuse it anyway. */}
      {ride.status === RideStatus.COMPLETED && <RateRide rideId={rideId} />}
    </div>
  );
}
