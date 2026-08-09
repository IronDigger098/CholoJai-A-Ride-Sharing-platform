import { describe, expect, it } from '@jest/globals';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MailModule } from '../../common/mail/mail.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigModule } from '../../config/config.module';
import { makeTestEnv } from '../../testing/env.fixture';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

import { AdminController } from './admin.controller';
import { AdminModule } from './admin.module';
import { AdminService } from './admin.service';

/** Stands in for the globally-provided Prisma client. */
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubPrismaModule {}

/**
 * Boots the admin graph.
 *
 * The specific risk this covers: `AdminController` applies `JwtAuthGuard`
 * and `RolesGuard` through `@Auth()`, but those live in `AuthModule`. Nest
 * resolves a guard in the context of the module that declares the
 * controller, so if `AuthModule` ever stops exporting them — or
 * `AdminModule` stops importing it — the application fails at startup, not
 * in any unit test. Every service spec here would still pass.
 */
describe('AdminModule (dependency graph)', () => {
  it('resolves the controller and both guards it applies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(makeTestEnv()),
        StubPrismaModule,
        MailModule,
        AdminModule,
      ],
    }).compile();

    expect(moduleRef.get(AdminController)).toBeInstanceOf(AdminController);
    expect(moduleRef.get(AdminService)).toBeInstanceOf(AdminService);
    expect(moduleRef.get(JwtAuthGuard, { strict: false })).toBeInstanceOf(
      JwtAuthGuard,
    );
    expect(moduleRef.get(RolesGuard, { strict: false })).toBeInstanceOf(
      RolesGuard,
    );

    await moduleRef.close();
  });
});
