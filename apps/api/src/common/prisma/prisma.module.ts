import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Database access, available application-wide.
 *
 * `@Global()` for the same reason as configuration: every feature module
 * needs it, and requiring each to import a module that has no options is
 * ceremony without benefit. Business modules are never global — the
 * boundary rules in architecture §3 depend on explicit imports between them.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
