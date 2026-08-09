import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import {
  AccessTokenService,
  accessTokenJwtOptions,
} from '../../common/security/access-token.service';
import { PasswordHasherService } from '../../common/security/password-hasher.service';
import { TokenService } from '../../common/security/token.service';
import { AppConfigService } from '../../config/app-config.service';
import { UsersModule } from '../users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';
import { PrismaVerificationTokenRepository } from './prisma-verification-token.repository';
import { RefreshCookieService } from './refresh-cookie.service';
import { REFRESH_TOKEN_REPOSITORY } from './refresh-token-repository.port';
import { RefreshTokenService } from './refresh-token.service';
import { RolesGuard } from './roles.guard';
import { VERIFICATION_TOKEN_REPOSITORY } from './verification-token-repository.port';

/**
 * Authentication.
 *
 * Imports `UsersModule` explicitly rather than relying on a global: the
 * dependency between features is exactly what the architecture's module
 * boundaries are meant to make visible (ADR-002). Reading this list tells
 * you what auth depends on.
 */
@Module({
  imports: [
    UsersModule,
    /* JWT signing and verification options. The factory lives beside
       `AccessTokenService` so the application and its tests configure the
       library identically — see `accessTokenJwtOptions` for why the
       algorithm allow-list there is the security-critical part. */
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: accessTokenJwtOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailVerificationService,
    PasswordResetService,
    PasswordHasherService,
    TokenService,
    AccessTokenService,
    RefreshTokenService,
    RefreshCookieService,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: VERIFICATION_TOKEN_REPOSITORY,
      useClass: PrismaVerificationTokenRepository,
    },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
  ],
  /* `JwtAuthGuard` and `AccessTokenService` are exported because every
     feature module from M4 onward protects its own routes with them. The
     repositories and the cookie service are not: how auth stores tokens
     and where it puts them is nobody else's business. */
  exports: [AuthService, AccessTokenService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
