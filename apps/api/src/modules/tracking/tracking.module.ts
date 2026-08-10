import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RidesModule } from '../rides/rides.module';

import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';

/**
 * Live driver positions.
 *
 * Imports `RidesModule` for `findActive`, which is how the gateway answers
 * "is this person on this ride" — the one question that decides both who may
 * publish and who may listen. `AuthModule` supplies the token service used
 * on the handshake.
 */
@Module({
  imports: [AuthModule, RidesModule],
  providers: [TrackingGateway, TrackingService],
})
export class TrackingModule {}
