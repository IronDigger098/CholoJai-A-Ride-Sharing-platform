import { describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { AppModule } from './app.module';
import { makeTestEnv } from './testing/env.fixture';

/**
 * The whole dependency graph resolves.
 *
 * This exists because of a bug that reached production. `SettingsService`
 * had taken a constructor dependency on `RefreshTokenService` since M10b.1
 * — changing a password revokes every session, and only auth can do that —
 * but `AuthModule` never exported it. Nest resolves the graph at startup,
 * so the container died on boot with `UnknownDependenciesException` and no
 * test had anything to say about it.
 *
 * Nothing caught it because every service spec constructs its subject
 * directly with fakes, which is the right way to test behaviour and is
 * exactly blind to module wiring. A missing `exports` entry is invisible
 * until something asks Nest to assemble the real thing.
 *
 * `compile()`, not `init()`. Compiling instantiates every provider and so
 * proves the graph is satisfiable; `init()` would additionally run
 * `onModuleInit`, which is where Prisma and Redis dial out — and this suite
 * has no business needing a database to answer a question about wiring.
 *
 * The honest limit: this proves the graph *resolves*, not that the app
 * works. A provider that throws on first use still passes here.
 */
describe('AppModule', () => {
  it('resolves every provider in the application graph', async () => {
    const moduleRef = Test.createTestingModule({
      imports: [AppModule.forRoot(makeTestEnv())],
    });

    await expect(moduleRef.compile()).resolves.toBeDefined();
  }, 30_000);
});
