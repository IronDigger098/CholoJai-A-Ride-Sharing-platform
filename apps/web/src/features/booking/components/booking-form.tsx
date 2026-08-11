'use client';

import { type Place, type VehicleType } from '@cholojai/shared';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useId, useState } from 'react';

import { bookRide, requestQuote } from '../api';

import { FareOptions } from './fare-options';
import { MapPanel } from './map-panel';
import { PlaceSearch } from './place-search';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * Every way a code can be refused.
 *
 * Listed so the message lands on the coupon field rather than in the banner
 * above the form. A rider whose journey was priced fine and whose code was
 * not needs to know which of the two the complaint is about — and the six
 * server-side messages already say what to do, so the only thing missing is
 * where to look.
 */
const COUPON_FAILURES = new Set([
  'COUPON_NOT_FOUND',
  'COUPON_NOT_RUNNING',
  'COUPON_EXHAUSTED',
  'COUPON_ALREADY_USED',
  'COUPON_FIRST_RIDE_ONLY',
  'FARE_BELOW_COUPON_MINIMUM',
]);

/**
 * Book a ride: pick two places, price them, choose a vehicle, confirm.
 *
 * Quoting is a mutation rather than a query. It writes — every quote is a
 * row with an expiry — and it must run when the rider asks, not whenever
 * React Query decides the inputs look stale.
 *
 * A refused code fails the whole quote rather than quietly pricing without
 * it. Showing full prices to someone who believes a discount applied is the
 * one outcome worth avoiding: they find out at the receipt, and by then the
 * ride has happened.
 */
export function BookingForm(): ReactNode {
  const router = useRouter();
  const id = useId();

  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const quote = useMutation({
    mutationFn: requestQuote,
    onSuccess: () => {
      setError(null);
      setCouponError(null);
    },
    onError: (cause: unknown) => {
      const failure = toApiError(cause);

      if (failure.code !== undefined && COUPON_FAILURES.has(failure.code)) {
        setCouponError(failure.message);
        setError(null);
        return;
      }

      setError(failure.message);
      setCouponError(null);
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
      /* Absent rather than empty. The contract's minimum length is three
         characters, so a blank string would be a validation failure for a
         rider who simply has no code. */
      ...(couponCode.trim() === '' ? {} : { couponCode: couponCode.trim() }),
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

      {/* Two ways into the same two values. Tapping fills whichever point
          is still empty, so the map and the search boxes stay in step
          rather than being separate sources of truth. */}
      <MapPanel
        pickup={pickup}
        dropoff={dropoff}
        onPlace={(place) => {
          if (pickup === null) setPickup(place);
          else setDropoff(place);
        }}
      />

      {/* Below the map, above the price button: it changes what the prices
          are, so it belongs on the input side of that line rather than
          appearing after the rider has already seen a number. */}
      <Field
        id={`${id}-coupon`}
        label="Promo code"
        hint="Optional."
        value={couponCode}
        onChange={(event) => {
          setCouponCode(event.target.value);
        }}
        {...(couponError === null ? {} : { error: couponError })}
      />

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
