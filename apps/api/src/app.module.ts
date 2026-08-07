import { type DynamicModule, Module } from '@nestjs/common';

import { LoggingModule } from './common/logging/logging.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env.schema';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';

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
        HealthModule,
        AuthModule,
      ],
    };
  }
}
