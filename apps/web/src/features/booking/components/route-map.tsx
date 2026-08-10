'use client';

import { type Place } from '@cholojai/shared';
import L from 'leaflet';
import { useEffect } from 'react';
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import type { ReactNode } from 'react';

import 'leaflet/dist/leaflet.css';

/**
 * The booking map (ADR-006: Leaflet, OpenStreetMap tiles, no API key).
 *
 * Client-only and dynamically imported by its wrapper — Leaflet touches
 * `window` at module scope, so importing it on the server throws during the
 * render rather than failing gracefully.
 */

/** Dhaka. Shown before either point is chosen. */
const DEFAULT_CENTRE: [number, number] = [23.7806, 90.4074];
const DEFAULT_ZOOM = 12;

/**
 * Markers as styled HTML rather than Leaflet's default images.
 *
 * The default icon is a PNG resolved by a relative URL that bundlers rewrite
 * and Leaflet then cannot find — the classic broken-marker bug, usually
 * patched by reaching into `L.Icon.Default.prototype`. A `divIcon` sidesteps
 * it entirely and uses the design tokens, which is what ADR-006 meant by an
 * original map UI rather than a generic one.
 */
/* Written out in full, not composed as `bg-${colour}`. Tailwind scans source
   for literal class strings, so an interpolated name produces no CSS and a
   marker with no colour. */
const PIN_CLASS = {
  pickup: 'block h-4 w-4 rounded-full border-2 border-surface bg-accent shadow',
  dropoff:
    'block h-4 w-4 rounded-full border-2 border-surface bg-action shadow',
} as const;

function pin(role: keyof typeof PIN_CLASS): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="${PIN_CLASS[role]}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/** Keep both points in view whenever either changes. */
function FitToPoints({
  pickup,
  dropoff,
}: {
  pickup: Place | null;
  dropoff: Place | null;
}): null {
  /* Annotated with Leaflet's own type rather than relying on what
     `useMap()` infers. react-leaflet ships ESM-only typings that `tsc`
     resolves and typescript-eslint does not, so its return reads as an
     unresolvable type and every call on it becomes an unsafe-call error.
     `@types/leaflet` is plain CommonJS and resolves either way. */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- see above
  const map: L.Map = useMap();

  useEffect(() => {
    const points = [pickup, dropoff].filter((place) => place !== null);

    if (points.length === 0) return;

    if (points.length === 1) {
      const only = points[0];
      if (only !== undefined) {
        map.setView([only.coordinates.lat, only.coordinates.lng], 15);
      }
      return;
    }

    map.fitBounds(
      points.map((place) => [place.coordinates.lat, place.coordinates.lng]),
      /* Padding, because a marker sitting exactly on the edge of the
         viewport is half cut off by its own anchor. */
      { padding: [48, 48] },
    );
  }, [map, pickup, dropoff]);

  return null;
}

function ClickToPlace({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}): null {
  useMapEvents({
    /* Annotated because `useMapEvents` takes a broad handler map that does
       not narrow per event name, so `event` would be an implicit any. */
    click: (event: L.LeafletMouseEvent) => {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export interface RouteMapProps {
  readonly pickup: Place | null;
  readonly dropoff: Place | null;
  readonly onPick: (lat: number, lng: number) => void;
}

export default function RouteMap({
  pickup,
  dropoff,
  onPick,
}: RouteMapProps): ReactNode {
  return (
    <MapContainer
      center={DEFAULT_CENTRE}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom={false}
      className="border-border-strong h-64 w-full rounded-md border"
      /* Scroll-wheel zoom off: the map sits inside a scrolling form, and
         capturing the wheel there traps the page when someone scrolls past
         it. Pinch and the +/- controls still zoom. */
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {pickup !== null && (
        <Marker
          position={[pickup.coordinates.lat, pickup.coordinates.lng]}
          icon={pin('pickup')}
        />
      )}

      {dropoff !== null && (
        <Marker
          position={[dropoff.coordinates.lat, dropoff.coordinates.lng]}
          icon={pin('dropoff')}
        />
      )}

      <FitToPoints pickup={pickup} dropoff={dropoff} />
      <ClickToPlace onPick={onPick} />
    </MapContainer>
  );
}
