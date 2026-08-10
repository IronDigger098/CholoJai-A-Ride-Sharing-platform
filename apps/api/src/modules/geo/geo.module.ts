import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { GEOCODING_PROVIDER } from './geocoding.port';
import { NominatimGeocodingProvider } from './nominatim-geocoding.provider';
import { OsrmRoutingProvider } from './osrm-routing.provider';
import { ROUTING_PROVIDER } from './routing.port';

/**
 * Routing, and later geocoding.
 *
 * `GeoService` is exported because the fares module is the reason this
 * exists — a quote cannot be priced without a distance and a duration. The
 * *service* is exported and the provider is not, so a cross-module call goes
 * through the cache and the error translation rather than reaching past them
 * to the raw OSRM adapter (architecture.md §3).
 *
 * The provider is bound to its port here rather than being injected by
 * class. That binding is the whole point of the port: swapping the public
 * OSRM demo server for a self-hosted instance, or for a provider that models
 * traffic, is this one line.
 */
@Module({
  imports: [AuthModule],
  controllers: [GeoController],
  providers: [
    GeoService,
    { provide: ROUTING_PROVIDER, useClass: OsrmRoutingProvider },
    { provide: GEOCODING_PROVIDER, useClass: NominatimGeocodingProvider },
  ],
  exports: [GeoService],
})
export class GeoModule {}
