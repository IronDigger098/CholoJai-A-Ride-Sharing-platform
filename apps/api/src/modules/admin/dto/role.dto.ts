import {
  grantRoleRequestSchema,
  revokeRoleParamsSchema,
  roleChangeResponseSchema,
  userIdParamSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * Path parameters get the same treatment as bodies.
 *
 * It is easy to validate the body and let `:userId` through unchecked
 * because "it is just a string". It is a string an unauthenticated caller
 * chooses, and it reaches a database query — the global validation pipe
 * covers it only if there is a schema to validate against.
 */
export class UserIdParamDto extends createZodDto(userIdParamSchema) {}

export class RevokeRoleParamsDto extends createZodDto(revokeRoleParamsSchema) {}

export class GrantRoleRequestDto extends createZodDto(grantRoleRequestSchema) {}

export class RoleChangeResponseDto extends createZodDto(
  roleChangeResponseSchema,
) {}
