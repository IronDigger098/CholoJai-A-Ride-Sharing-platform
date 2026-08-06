import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { DATABASE_PROBE } from './database-probe';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * The first feature module, and the template every later one follows:
 * a controller that only handles HTTP, a service that holds the logic, and
 * a module that wires them (architecture §3).
 *
 * Binding `DATABASE_PROBE` to `PrismaService` happens *here*, at the
 * composition boundary. `PrismaService` satisfies the `DatabaseProbe`
 * interface structurally without importing or knowing about it, and
 * `HealthService` never learns which database library is underneath.
 */
@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: DATABASE_PROBE, useExisting: PrismaService },
  ],
})
export class HealthModule {}
