import { Module } from '@nestjs/common';

import { PasswordHasherService } from '../../common/security/password-hasher.service';
import { UsersModule } from '../users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Authentication.
 *
 * Imports `UsersModule` explicitly rather than relying on a global: the
 * dependency between features is exactly what the architecture's module
 * boundaries are meant to make visible (ADR-002). Reading this list tells
 * you what auth depends on.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordHasherService],
  exports: [AuthService],
})
export class AuthModule {}
