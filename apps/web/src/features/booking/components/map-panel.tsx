'use client';

import { type Place } from '@cholojai/shared';
import { useMutation } from '@tanstack/react-query';
import dynamic from 'next/dynamic';

import { reverseGeocode } from '../api';

import { type RouteMapProps } from './route-map';

import type { ComponentType, ReactNode } from 'react';

/**
 * The map, and what a dropped pin means.
 *
 * `ssr: false` is not a preference. Leaflet reads `window` at module scope,
 * so a server render throws before anything can be caught — the whole page
 * 500s because of a component that only ever runs in a browser.
 *
 * The map is an alternative to the search boxes, not a replacement. Typing
 * "Banani 11" is faster than panning to it, and a rider on a phone with no
 * signal for tiles can still book. Both write to the same two places.
 */
/* Annotated on the constant rather than passed as `dynamic<RouteMapProps>`,
   which Next 16 does not thread through to the returned component — without
   this the props are unchecked and every handler below is an implicit any.
   Importing the type is safe: types are erased, so this does not pull
   Leaflet into the server bundle the way a value import would. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- see above
const RouteMap: ComponentType<RouteMapProps> = dynamic(
  () => import('./route-map'),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="border-border-strong bg-surface-raised text-content-muted flex h-64 w-full items-center justify-center rounded-md border text-sm"
      >
        Loading map…
      </div>
    ),
  },
);

export interface MapPanelProps {
  readonly pickup: Place | null;
  readonly dropoff: Place | null;
  readonly onPlace: (place: Place) => void;
}

export function MapPanel({
  pickup,
  dropoff,
  onPlace,
}: MapPanelProps): ReactNode {
  const lookup = useMutation({
    mutationFn: reverseGeocode,
    onSuccess: (place) => {
      /* Null means no address there — open water, the middle of a field.
         Ignored rather than surfaced as an error: the rider dropped a pin
         somewhere with no address, which the next tap fixes. */
      if (place !== null) onPlace(place);
    },
  });

  /**
   * Which point a tap sets.
   *
   * Pickup first, then destination, then destination again — so the first
   * two taps build a journey and every later one corrects the end of it.
   * Choosing by "whichever is empty" would strand a rider who wants to
   * change their pickup, but that is what the search box above is for, and
   * a mode switch on a map is a control nobody finds.
   */
  return (
    <div className="space-y-2">
      <RouteMap
        pickup={pickup}
        dropoff={dropoff}
        onPick={(lat, lng) => {
          lookup.mutate({ lat, lng });
        }}
      />

      <p className="text-content-subtle text-xs">
        {lookup.isPending
          ? 'Finding that place…'
          : pickup === null
            ? 'Tap the map to set your pickup.'
            : 'Tap the map to set your destination.'}
      </p>
    </div>
  );
}
