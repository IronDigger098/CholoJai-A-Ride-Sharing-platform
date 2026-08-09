import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GeoModule } from '../geo/geo.module';

import { FARE_QUOTE_REPOSITORY } from './fare-quote-repository.port';
import { FaresController } from './fares.controller';
import { FaresService } from './fares.service';
import { PrismaFareQuoteRepository } from './prisma-fare-quote.repository';

/**
 * Fare quoting.
 *
 * Imports `GeoModule` for its *service*, not its provider — the cross-module
 * call goes through the cache and the error translation rather than reaching
 * past them to the OSRM adapter (architecture.md §3).
 *
 * `FaresService` is exported because M5.4's booking flow consumes a quote,
 * and the repository is exported alongside it because booking reads a quote
 * back by id without re-pricing anything. Both are deliberate: the ride
 * module needs to read a stored offer, not to make a new one.
 */
@Module({
  imports: [AuthModule, GeoModule],
  controllers: [FaresController],
  providers: [
    FaresService,
    { provide: FARE_QUOTE_REPOSITORY, useClass: PrismaFareQuoteRepository },
  ],
  exports: [FaresService, FARE_QUOTE_REPOSITORY],
})
export class FaresModule {}
