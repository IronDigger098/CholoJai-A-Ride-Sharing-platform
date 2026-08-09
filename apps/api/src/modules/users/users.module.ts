import { Module } from '@nestjs/common';

import { PrismaUserRepository } from './prisma-user.repository';
import { USER_REPOSITORY } from './user-repository.port';

/**
 * Binds the user repository port to its PostgreSQL adapter.
 *
 * The token is exported, not the concrete class — consumers depend on the
 * interface and never learn which database is underneath.
 */
@Module({
  providers: [{ provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
