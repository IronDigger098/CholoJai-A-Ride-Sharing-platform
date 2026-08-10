import { UserRole } from '@cholojai/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUser } from '../auth/current-user.decorator';
import { Auth } from '../auth/roles.decorator';

import { AdminService } from './admin.service';
import {
  GrantRoleRequestDto,
  RevokeRoleParamsDto,
  RoleChangeResponseDto,
  UserIdParamDto,
} from './dto/role.dto';
import { UserListQueryDto, UserPageDto } from './dto/user.dto';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * Administrative endpoints.
 *
 * `@Auth(UserRole.ADMIN)` is applied to the *class*, not to each method.
 * Every route in this controller is administrative, so protecting them
 * individually would mean the security of the endpoint added next year
 * depends on someone remembering a decorator. Declaring it once at the
 * boundary makes the default correct and any exception loudly visible.
 */
@ApiTags('Admin')
@Controller({ path: 'admin', version: '1' })
@Auth(UserRole.ADMIN)
export class AdminController {
  public constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({
    summary: 'User directory',
    description:
      'Active users, newest first, cursor-paginated.\n\n' +
      '`q` matches name or email, case-insensitively — an administrator ' +
      'looking someone up has a fragment of something and rarely knows ' +
      'which field it came from. `role` narrows the directory instead, ' +
      'which is a different act from searching it.\n\n' +
      'Soft-deleted accounts are excluded, because every other endpoint ' +
      'already refuses to find them — listing one would offer a row whose ' +
      'every action fails.',
  })
  @ApiOkResponse({ type: UserPageDto })
  public async listUsers(
    @Query() query: UserListQueryDto,
  ): Promise<UserPageDto> {
    return this.adminService.listUsers(query);
  }

  @Post('users/:userId/roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Grant a role',
    description:
      'Adds a role to a user. Idempotent — granting a role the user ' +
      'already holds succeeds and changes nothing.\n\n' +
      'Roles are additive and flat: an ADMIN is not implicitly a DRIVER. ' +
      'Granting someone the ability to drive means granting DRIVER, even ' +
      'if they are already an administrator.\n\n' +
      'This is the low-level mechanism. The reviewed driver-application ' +
      'flow (M7) will call it; until then it is also how the first driver ' +
      'is created.',
  })
  @ApiOkResponse({
    description: 'The user, with their new role set.',
    type: RoleChangeResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No active user has that id.',
    ...PROBLEM_DETAILS,
  })
  public async grantRole(
    @Param() params: UserIdParamDto,
    @Body() body: GrantRoleRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RoleChangeResponseDto> {
    return this.adminService.grantRole(actor.id, params.userId, body.role);
  }

  @Delete('users/:userId/roles/:role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a role',
    description:
      'Removes a role from a user. Idempotent.\n\n' +
      'Two refusals, both protecting an invariant rather than a ' +
      'permission. RIDER cannot be revoked, because every account is a ' +
      'rider and an account without it can sign in and do nothing. And an ' +
      'administrator cannot revoke their own ADMIN role — which is what ' +
      'guarantees the platform can never run out of administrators, since ' +
      'the last one standing is the only person able to remove them.\n\n' +
      'A demotion takes effect on the next token refresh, within the ' +
      'access-token lifetime, because refreshing re-reads roles from the ' +
      'database.',
  })
  @ApiOkResponse({
    description: 'The user, with their new role set.',
    type: RoleChangeResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No active user has that id.',
    ...PROBLEM_DETAILS,
  })
  @ApiConflictResponse({
    description:
      'The change would break an invariant: removing RIDER, or removing ' +
      'your own ADMIN role.',
    ...PROBLEM_DETAILS,
  })
  public async revokeRole(
    @Param() params: RevokeRoleParamsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RoleChangeResponseDto> {
    return this.adminService.revokeRole(actor.id, params.userId, params.role);
  }
}
