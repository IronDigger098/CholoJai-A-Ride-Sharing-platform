import { type Coordinates, type Place } from '@cholojai/shared';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigService } from '../../config/app-config.service';

import { GeocodingUnavailableError } from './geo.errors';
import { type GeocodingProvider } from './geocoding.port';

/**
 * Nominatim, behind the geocoding port.
 *
 * The only file that knows Nominatim exists — its parameters, its response
 * shape, and its usage policy.
 */

/** As much of Nominatim's answer as we rely on. Parsed, never cast. */
const nominatimPlaceSchema = z.object({
  place_id: z.union([z.string(), z.number()]),
  display_name: z.string(),
  lat: z.string(),
  lon: z.string(),
});

const searchResultsSchema = z.array(nominatimPlaceSchema);

/**
 * Bias results toward Bangladesh without excluding anywhere.
 *
 * `countrycodes` filters rather than ranks, which would refuse a legitimate
 * cross-border address. A viewbox biases: the same query returns Dhaka's
 * Banani ahead of anywhere else called Banani, and still returns the others.
 */
const BANGLADESH_VIEWBOX = '88.0,20.5,92.7,26.7';

const RESULT_LIMIT = 8;

@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(NominatimGeocodingProvider.name);

  public constructor(private readonly config: AppConfigService) {}

  public async search(query: string): Promise<readonly Place[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '0',
      limit: String(RESULT_LIMIT),
      viewbox: BANGLADESH_VIEWBOX,
      bounded: '0',
    });

    const parsed = searchResultsSchema.safeParse(
      await this.get(`/search?${params.toString()}`),
    );

    if (!parsed.success) {
      this.logger.warn('Nominatim returned an unrecognised search body');
      throw new GeocodingUnavailableError(parsed.error);
    }

    return parsed.data.map(toPlace);
  }

  public async reverse(point: Coordinates): Promise<Place | null> {
    const params = new URLSearchParams({
      lat: String(point.lat),
      lon: String(point.lng),
      format: 'jsonv2',
      addressdetails: '0',
    });

    const body = await this.get(`/reverse?${params.toString()}`);
    const parsed = nominatimPlaceSchema.safeParse(body);

    /* Nominatim answers 200 with `{ error: "Unable to geocode" }` for a
       point in open water. Not an error condition — a pin dropped in a
       river has no address, and that is a result. */
    return parsed.success ? toPlace(parsed.data) : null;
  }

  private async get(path: string): Promise<unknown> {
    const { nominatimBaseUrl, timeoutMs, userAgent } = this.config.geocoding;

    try {
      const response = await fetch(`${nominatimBaseUrl}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
        /* Nominatim's usage policy requires an identifying User-Agent and
           refuses anonymous traffic. Sending one is not politeness; it is
           the difference between working and being blocked. */
        headers: { accept: 'application/json', 'user-agent': userAgent },
      });

      if (!response.ok) {
        this.logger.warn(`Nominatim returned HTTP ${response.status}`);
        throw new GeocodingUnavailableError(
          new Error(`Nominatim responded ${response.status}`),
        );
      }

      return await response.json();
    } catch (cause) {
      if (cause instanceof GeocodingUnavailableError) throw cause;

      this.logger.warn(
        `Nominatim request failed: ${cause instanceof Error ? cause.message : 'unknown error'}`,
      );
      throw new GeocodingUnavailableError(cause);
    }
  }
}

function toPlace(raw: z.infer<typeof nominatimPlaceSchema>): Place {
  return {
    id: String(raw.place_id),
    label: raw.display_name,
    /* Nominatim returns coordinates as strings, and `lon` rather than
       `lng`. Both translations stop here. */
    coordinates: { lat: Number(raw.lat), lng: Number(raw.lon) },
  };
}
