'use client';

import {
  type Coordinates,
  type DriverLocation,
  driverLocationSchema,
  TRACKING_EVENTS,
} from '@cholojai/shared';
import { useEffect, useState } from 'react';

import { trackingSocket } from './socket';

/**
 * Watch a ride's driver position.
 *
 * Returns null until the first position arrives — which may be immediately,
 * because the server replays the last-known one on subscribe.
 */
export function useRideLocation(rideId: string | null): Coordinates | null {
  /* The ride is stored alongside the position rather than reset by an
     effect when it changes. Deriving at render is both simpler and safer:
     a position from a previous ride cannot appear on the next one even for
     a frame, because the filter happens on the way out. */
  const [fix, setFix] = useState<{
    rideId: string;
    coordinates: Coordinates;
  } | null>(null);

  useEffect(() => {
    if (rideId === null) return;

    const socket = trackingSocket();

    function onLocation(payload: unknown): void {
      /* Parsed, not trusted. This arrives over a socket the browser opened
         to a server it cannot verify beyond TLS, and it decides where a
         marker is drawn. */
      const parsed = driverLocationSchema.safeParse(payload);
      if (parsed.success) {
        setFix({
          rideId: parsed.data.rideId,
          coordinates: parsed.data.coordinates,
        });
      }
    }

    socket.on(TRACKING_EVENTS.location, onLocation);
    socket.connect();
    socket.emit(TRACKING_EVENTS.subscribe, { rideId });

    return () => {
      socket.off(TRACKING_EVENTS.location, onLocation);
      /* The listener goes, the connection stays. Another screen may be
         using it, and reconnecting on every navigation would cost a
         handshake per route change. */
    };
  }, [rideId]);

  return fix?.rideId === rideId ? fix.coordinates : null;
}

/**
 * Publish this device's position for a ride.
 *
 * The driver's side of the same socket. Geolocation is watched rather than
 * polled — the browser decides when the position has meaningfully changed,
 * which is both more accurate and cheaper than a timer.
 */
export function usePublishLocation(rideId: string | null): void {
  useEffect(() => {
    if (rideId === null) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return;
    }

    const socket = trackingSocket();
    socket.connect();

    const watchId = navigator.geolocation.watchPosition(
      (fix) => {
        const location: DriverLocation = {
          rideId,
          coordinates: {
            lat: fix.coords.latitude,
            lng: fix.coords.longitude,
          },
          at: new Date().toISOString(),
        };

        socket.emit(TRACKING_EVENTS.publish, location);
      },
      /* Permission refused, or no fix. Not an error to surface: the ride
         works without tracking, and a driver who declined the prompt does
         not need telling twice. */
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5_000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [rideId]);
}
