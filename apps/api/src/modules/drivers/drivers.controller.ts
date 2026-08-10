import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUser } from '../auth/current-user.decorator';
import { Auth } from '../auth/roles.decorator';

import { DriversService } from './drivers.service';
import {
  DriverApplicationRequestDto,
  DriverProfileDto,
  MyDriverProfileDto,
} from './dto/driver.dto';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * The driver's own endpoints.
 *
 * `@Auth()` without a role: applying is something a *rider* does. Requiring
 * DRIVER here would mean only drivers could ask to become one.
 */
@ApiTags('Drivers')
@Controller({ path: 'drivers', version: '1' })
@Auth()
export class DriversController {
  public constructor(private readonly driversService: DriversService) {}

  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Apply to drive',
    description:
      'Creates a PENDING application for the signed-in user.\n\n' +
      'The licence number is masked on arrival and the full value is never ' +
      'stored. A platform that verifies licences against an authority keeps ' +
      'them under a retention policy; this one does neither, so holding the ' +
      'number would mean keeping an identity document for no purpose it can ' +
      'serve.\n\n' +
      'Approval grants the DRIVER role. Until then the account is an ' +
      'ordinary rider.',
  })
  @ApiCreatedResponse({
    description: 'The new application.',
    type: DriverProfileDto,
  })
  @ApiConflictResponse({
    description: 'This user has already applied.',
    ...PROBLEM_DETAILS,
  })
  public async apply(
    @Body() body: DriverApplicationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverProfileDto> {
    return this.driversService.apply(user.id, body.licenseNo);
  }

  @Get('me')
  @ApiOperation({
    summary: 'My driver application',
    description:
      'The caller’s application and its status, or `null` if they have ' +
      'never applied. Wrapped rather than answering 404 — not having ' +
      'applied is an ordinary state, not a missing resource.',
  })
  @ApiOkResponse({
    description: 'The application, or `{ "profile": null }`.',
    type: MyDriverProfileDto,
  })
  public async me(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyDriverProfileDto> {
    return { profile: await this.driversService.myProfile(user.id) };
  }
}
