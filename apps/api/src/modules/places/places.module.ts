import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { PrismaSavedPlaceRepository } from './prisma-saved-place.repository';
import { SAVED_PLACE_REPOSITORY } from './saved-place-repository.port';

/**
 * Saved places.
 *
 * Exports the service because search reads through it — places is small
 * enough that the service *is* the read model, unlike rides where the
 * service is a lifecycle and the port is the read model.
 */
@Module({
  imports: [AuthModule],
  controllers: [PlacesController],
  providers: [
    PlacesService,
    { provide: SAVED_PLACE_REPOSITORY, useClass: PrismaSavedPlaceRepository },
  ],
  exports: [PlacesService],
})
export class PlacesModule {}
