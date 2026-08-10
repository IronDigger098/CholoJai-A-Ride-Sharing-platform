import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ANALYTICS_REPOSITORY } from './analytics-repository.port';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PrismaAnalyticsRepository } from './prisma-analytics.repository';

/**
 * Platform metrics.
 *
 * Its own module rather than a method on `AdminService`, because it reads
 * across users, rides, and driver profiles and owns none of them. Grouping
 * it with role management would give the platform's most privileged service
 * a reason to touch three more tables.
 *
 * `AuthModule` supplies the guard behind `@Auth(UserRole.ADMIN)`.
 */
@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    { provide: ANALYTICS_REPOSITORY, useClass: PrismaAnalyticsRepository },
  ],
})
export class AnalyticsModule {}
