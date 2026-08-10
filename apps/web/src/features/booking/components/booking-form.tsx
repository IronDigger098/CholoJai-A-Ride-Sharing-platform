'use client';

import { type Place, type VehicleType } from '@cholojai/shared';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { bookRide, requestQuote } from '../api';

import { FareOptions } from './fare-options';
import { PlaceSearch } from './place-search';

import { Button } from '@/components/ui/button';
import { toApiError } from '@/lib/api-error';

/**
 * Book a ride: pick two places, price them, choose a vehicle, confirm.
 *
 * Quoting is a mutation rather than a query. It writes — every quote is a
 * row with an expiry — and it must run when the rider asks, not whenever
 * React Query decides the inputs look stale.
 */
export function BookingForm(): ReactNode {
  const router = useRouter();

  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const quote = useMutation({
    mutationFn: requestQuote,
    onSuccess: () => {
      setError(null);
    },
    onError: (cause: unknown) => {
      setError(toApiError(cause).message);
    },
  });

  const booking = useMutation({
    mutationFn: bookRide,
    onSuccess: (ride) => {
      router.push(`/rides/${ride.id}`);
    },
    onError: (cause: unknown) => {
      const failure = toApiError(cause);
      setError(failure.message);

      /* The price expired between quoting and confirming. Clearing it puts
         the rider back at "get a price" rather than leaving a Confirm
         button that will fail the same way every time it is pressed. */
      if (failure.code === 'QUOTE_EXPIRED') {
        quote.reset();
        setVehicleType(null);
      }
    },
  });

  function onQuote(): void {
    if (pickup === null || dropoff === null) return;

    setVehicleType(null);
    quote.mutate({
      pickup: pickup.coordinates,
      pickupAddress: pickup.label,
      dropoff: dropoff.coordinates,
      dropoffAddress: dropoff.label,
    });
  }

  function onConfirm(): void {
    if (quote.data === undefined || vehicleType === null) return;

    booking.mutate({ quoteId: quote.data.id, vehicleType });
  }

  return (
    <div className="space-y-6">
      {error !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <PlaceSearch label="Pickup" value={pickup} onSelect={setPickup} />
      <PlaceSearch label="Destination" value={dropoff} onSelect={setDropoff} />

      <Button
        onClick={onQuote}
        disabled={pickup === null || dropoff === null || quote.isPending}
        className="w-full"
      >
        {quote.isPending ? 'Getting prices…' : 'See prices'}
      </Button>

      {quote.data !== undefined && (
        <>
          <FareOptions
            quote={quote.data}
            selected={vehicleType}
            onSelect={setVehicleType}
          />

          <Button
            variant="accent"
            onClick={onConfirm}
            disabled={vehicleType === null || booking.isPending}
            className="w-full"
          >
            {booking.isPending ? 'Booking…' : 'Confirm booking'}
          </Button>
        </>
      )}
    </div>
  );
}
