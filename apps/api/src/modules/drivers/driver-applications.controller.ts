import { UserRole } from '@cholojai/shared';
import {
  Body,
  Controller,
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

import { DriversService } from './drivers.service';
import {
  DriverApplicationListDto,
  DriverApplicationListQueryDto,
  DriverProfileDto,
  DriverProfileIdParamDto,
  RejectDriverApplicationDto,
} from './dto/driver.dto';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * Application review, served under `/admin` and owned by this module.
 *
 * The path is administrative; the logic is not. Approving an application
 * needs the driver repository and the masking rules that live here, so
 * putting the controller in `AdminModule` would mean either reaching into
 * another module's repository or creating a dependency cycle between the
 * two. A URL prefix and a module boundary are independent, and this is the
 * case that shows why (architecture.md §3).
 */
@ApiTags('Admin')
@Controller({ path: 'admin/driver-applications', version: '1' })
@Auth(UserRole.ADMIN)
export class DriverApplicationsController {
  public constructor(private readonly driversService: DriversService) {}

  @Get()
  @ApiOperation({
    summary: 'Review queue',
    description:
      'Applications with the given status, oldest first — a review queue ' +
      'is a queue, and the person waiting longest should not be at the ' +
      'bottom of it. Defaults to PENDING.',
  })
  @ApiOkResponse({ type: DriverApplicationListDto })
  public async list(
    @Query() query: DriverApplicationListQueryDto,
  ): Promise<DriverApplicationListDto> {
    return {
      applications: [...(await this.driversService.listApplications(query))],
    };
  }

  @Post(':driverProfileId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve an application',
    description:
      'Marks the application APPROVED and grants the DRIVER role.\n\n' +
      'The role is granted first, deliberately. It is idempotent and, on ' +
      'its own, useless — every driver endpoint also requires an APPROVED ' +
      'profile — so a failure between the two writes leaves an account ' +
      'holding a role it cannot exercise and an application still pending, ' +
      'which an administrator can simply retry. The reverse order would ' +
      'produce an approved driver whose token never carries the role, and ' +
      'no retry would fix it.\n\n' +
      'The new role takes effect on the driver’s next token refresh.',
  })
  @ApiOkResponse({ type: DriverProfileDto })
  @ApiNotFoundResponse({
    description: 'No application with that id.',
    ...PROBLEM_DETAILS,
  })
  @ApiConflictResponse({
    description:
      'Already approved or rejected — two administrators working the same ' +
      'queue, or one double-click. The first decision stands.',
    ...PROBLEM_DETAILS,
  })
  public async approve(
    @Param() params: DriverProfileIdParamDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DriverProfileDto> {
    return this.driversService.approve(actor.id, params.driverProfileId);
  }

  @Post(':driverProfileId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject an application',
    description:
      'Marks the application REJECTED with a required reason. No role is ' +
      'revoked because none was granted — a rejected applicant is an ' +
      'ordinary rider whose account is untouched.\n\n' +
      'The reason is required rather than optional: a rejection nobody can ' +
      'act on is one the applicant cannot fix and the platform cannot ' +
      'defend.',
  })
  @ApiOkResponse({ type: DriverProfileDto })
  @ApiNotFoundResponse({
    description: 'No application with that id.',
    ...PROBLEM_DETAILS,
  })
  @ApiConflictResponse({
    description: 'Already approved or rejected.',
    ...PROBLEM_DETAILS,
  })
  public async reject(
    @Param() params: DriverProfileIdParamDto,
    @Body() body: RejectDriverApplicationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DriverProfileDto> {
    return this.driversService.reject(
      actor.id,
      params.driverProfileId,
      body.reason,
    );
  }
}
