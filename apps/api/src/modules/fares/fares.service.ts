import {
  estimateAllFares,
  type FareOption,
  type FareQuoteRequest,
  type FareQuoteResponse,
  VEHICLE_TYPE_ORDER,
} from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { GeoService } from '../geo/geo.service';

import {
  FARE_QUOTE_REPOSITORY,
  type FareQuoteRepository,
} from './fare-quote-repository.port';
import { RouteTooLongError } from './fares.errors';

/**
 * Pricing a proposed journey.
 *
 * The order matters and is the whole service: measure the route server-side,
 * price every vehicle type from it, then persist the result with an expiry.
 * Measuring first is what stops a rider pricing their own ride — the client
 * sends two coordinates and receives five numbers, and never gets to say how
 * far apart they are.
 *
 * The quote is stored rather than signed. Booking has to consume exactly one
 * quote exactly once, which is a row with an id, not a token the server can
 * only re-verify.
 */
@Injectable()
export class FaresService {
  public constructor(
    private readonly geo: GeoService,
    @Inject(FARE_QUOTE_REPOSITORY)
    private readonly quotes: FareQuoteRepository,
    private readonly config: AppConfigService,
  ) {}

  public async quote(request: FareQuoteRequest): Promise<FareQuoteResponse> {
    const route = await this.geo.route(request.pickup, request.dropoff);

    const { maxDistanceMetres, quoteTtlSeconds } = this.config.fares;

    if (route.distanceMetres > maxDistanceMetres) {
      throw new RouteTooLongError(route.distanceMetres, maxDistanceMetres);
    }

    const priced = estimateAllFares({
      distanceMetres: route.distanceMetres,
      durationSeconds: route.durationSeconds,
    });

    /* Cheapest first, because that is the order the picker renders and the
       order is a property of the offer rather than something each client
       re-derives. `VEHICLE_TYPE_ORDER` is the single definition of it, and
       `fare.test.ts` asserts the prices actually agree with it — a rate
       change cannot leave this list quietly claiming the wrong option is
       cheapest. */
    const options: FareOption[] = VEHICLE_TYPE_ORDER.map((vehicleType) => ({
      vehicleType,
      breakdown: priced[vehicleType],
    }));

    /* Absolute, from the server's clock. A duration would start counting
       whenever the client read it, which on a slow connection is not when
       this was issued — and the server's clock is the only one that decides
       whether booking succeeds. */
    const expiresAt = new Date(Date.now() + quoteTtlSeconds * 1000);

    const saved = await this.quotes.create({
      pickup: request.pickup,
      pickupAddress: request.pickupAddress,
      dropoff: request.dropoff,
      dropoffAddress: request.dropoffAddress,
      distanceMetres: route.distanceMetres,
      durationSeconds: route.durationSeconds,
      options,
      expiresAt,
    });

    return {
      id: saved.id,
      distanceMetres: route.distanceMetres,
      durationSeconds: route.durationSeconds,
      expiresAt: expiresAt.toISOString(),
      options,
    };
  }
}
