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
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
