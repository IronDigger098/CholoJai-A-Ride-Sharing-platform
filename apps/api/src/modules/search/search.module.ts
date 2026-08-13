import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PlacesModule } from '../places/places.module';
import { RidesModule } from '../rides/rides.module';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * Global search.
 *
 * Depends on places and rides, and nothing depends on it — the leaf of the
 * graph, which is where a read-only aggregator belongs. Help needs no import
 * at all: `HELP_ARTICLES` is a typed constant in the shared package, not a
 * table, because twelve paragraphs of copy do not need a migration to
 * change.
 */
@Module({
  imports: [AuthModule, PlacesModule, RidesModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
