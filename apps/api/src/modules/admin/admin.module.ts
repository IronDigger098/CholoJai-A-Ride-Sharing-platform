import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Operations and moderation.
 *
 * Imports `AuthModule` for the guards its controller applies, and
 * `UsersModule` for the repository. Both are explicit rather than global,
 * which is the point of module boundaries: reading these two lines tells
 * you that admin can reach identity and users, and nothing else.
 */
/*
 * Exports `AdminService` for exactly one caller. Approving a driver has to
 * grant the DRIVER role, and role changes belong here — `DriversModule`
 * already documents importing this module for `grantRole`, and this is the
 * line that makes that true. Without it the import was decorative.
 *
 * The dependency runs one way: admin knows nothing about drivers.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
