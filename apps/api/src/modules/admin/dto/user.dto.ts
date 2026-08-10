import { userListQuerySchema, userPageSchema } from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * Query strings arrive as text and are coerced by the schema.
 *
 * `limit` is `z.coerce.number()` for exactly this reason: `?limit=20` is the
 * string "20", and a schema that demanded a number would reject every real
 * request while passing every test that called the service directly.
 */
export class UserListQueryDto extends createZodDto(userListQuerySchema) {}

export class UserPageDto extends createZodDto(userPageSchema) {}
