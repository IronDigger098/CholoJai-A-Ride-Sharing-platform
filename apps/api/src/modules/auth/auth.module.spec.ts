import { UserRole } from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MailModule } from '../../common/mail/mail.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessTokenService } from '../../common/security/access-token.service';
import { ConfigModule } from '../../config/config.module';
import { makeTestEnv } from '../../testing/env.fixture';

import { AuthController } from './auth.controller';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshCookieService } from './refresh-cookie.service';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Stands in for the real Prisma client.
 *
 * `PrismaModule` is global in the running application, so the repositories
 * never import it themselves. Reproducing that shape here is the point of
 * the test: a provider that resolves only because some *other* module
 * happened to import its dependency is a bug waiting for the day that
 * import is removed.
 */
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubPrismaModule {}

/**
 * Boots the dependency graph and nothing else.
 *
 * There is a whole category of defect that unit tests cannot see, because
 * unit tests construct services with `new` and pass the collaborators by
 * hand. A missing provider, a token that no module exports, a circular
 * import, a factory that injects something out of scope — all of them pass
 * every unit test and then crash the process on boot. This suite is cheap
 * insurance against shipping one.
 *
 * It asserts resolvability, not behaviour. Behaviour is covered by the
 * service specs, which run without a framework at all.
 */
describe('AuthModule (dependency graph)', () => {
  async function compile(): Promise<
    Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>
  > {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(makeTestEnv()),
        StubPrismaModule,
        MailModule,
        AuthModule,
      ],
    }).compile();
  }

  it('resolves every provider the module declares', async () => {
    const moduleRef = await compile();

    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
    expect(moduleRef.get(RefreshTokenService)).toBeInstanceOf(
      RefreshTokenService,
    );
    expect(moduleRef.get(RefreshCookieService)).toBeInstanceOf(
      RefreshCookieService,
    );
    expect(moduleRef.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);

    await moduleRef.close();
  });

  it('configures the JWT module from the validated environment', async () => {
    /* `JwtModule.registerAsync` injects `AppConfigService` from the global
       config module. If that resolution ever breaks, the failure surfaces
       at boot rather than at the first sign-in — but only if something
       actually signs a token, which is what this does. */
    const moduleRef = await compile();
    const tokens = moduleRef.get(AccessTokenService);

    const signed = tokens.sign({ sub: 'user_1', roles: [UserRole.RIDER] });

    expect(tokens.verify(signed).status).toBe('valid');
    expect(tokens.ttlSeconds).toBe(15 * 60);

    await moduleRef.close();
  });
});
