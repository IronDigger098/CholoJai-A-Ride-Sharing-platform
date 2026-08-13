import { type DynamicModule, Module } from '@nestjs/common';

import { LoggingModule } from './common/logging/logging.module';
import { MailModule } from './common/mail/mail.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { RedisModule } from './common/redis/redis.module';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env.schema';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContactModule } from './modules/contact/contact.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { FaresModule } from './modules/fares/fares.module';
import { GeoModule } from './modules/geo/geo.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { RidesModule } from './modules/rides/rides.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';

/**
 * The composition root.
 *
 * This file only wires modules together — it holds no logic of its own.
 * Feature modules (auth, rides, drivers…) are registered here as milestones
 * land, each self-contained per `docs/architecture.md` §3.
 *
 * `forRoot` takes the already-validated environment so the whole
 * application graph can be constructed in a test with a fixture config.
 */
@Module({})
export class AppModule {
  public static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggingModule.forRoot(env),
        PrismaModule,
        RedisModule,
        /* Before the feature modules: it registers an APP_GUARD, and a
           guard that is not in the container when a route is resolved
           simply does not run. */
        RateLimitModule,
        MailModule,
        HealthModule,
        AuthModule,
        AdminModule,
        AnalyticsModule,
        /* Before notifications, which asks it whether a category is muted
           before sending. Settings knows nothing about notifications going
           out, so the dependency runs one way. */
        SettingsModule,
        /* Before the modules that raise notifications, so its service is in
           the container by the time they ask for it. */
        NotificationsModule,
        GeoModule,
        FaresModule,
        RidesModule,
        DriversModule,
        VehiclesModule,
        TrackingModule,
        ReviewsModule,
        ContactModule,
      ],
    };
  }
}
