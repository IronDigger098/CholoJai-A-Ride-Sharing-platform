import { type DynamicModule, Global, Module } from '@nestjs/common';

import { AppConfigService } from './app-config.service';
import { type Env } from './env.schema';

/**
 * Makes the validated environment injectable across the application.
 *
 * The environment is parsed in `main.ts` *before* Nest bootstraps and
 * passed in here, rather than being read from `process.env` inside a
 * factory. Two reasons:
 *
 * 1. **Clean failure.** A config error thrown during module instantiation
 *    is caught by Nest's internal exception handler, which prints a stack
 *    trace through the DI container and buries the actual message. Failing
 *    before `NestFactory.create` gives the operator a readable report.
 * 2. **Explicit dependency.** The module takes its configuration as an
 *    argument instead of reaching into global state, so a test can boot
 *    the app with a fixture environment and no `process.env` mutation.
 *
 * `@Global()` is used deliberately and sparingly — configuration is one of
 * the few genuinely cross-cutting concerns. Business modules are never global.
 */
@Global()
@Module({})
export class ConfigModule {
  public static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        { provide: AppConfigService, useValue: new AppConfigService(env) },
      ],
      exports: [AppConfigService],
    };
  }
}
