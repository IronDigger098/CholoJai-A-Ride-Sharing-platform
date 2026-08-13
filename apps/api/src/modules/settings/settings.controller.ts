import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUser } from '../auth/current-user.decorator';
import { Auth } from '../auth/roles.decorator';

import {
  ChangePasswordRequestDto,
  NotificationSettingsDto,
  UpdateNotificationSettingsRequestDto,
  UpdateProfileRequestDto,
  UserSummaryDto,
} from './dto/settings.dto';
import { SettingsService } from './settings.service';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * A person's own account.
 *
 * `me` in every path, and no route takes a user id. That is what makes the
 * whole controller safe by construction: there is no way to express "edit
 * somebody else", so there is no authorisation check to forget. The
 * administrative equivalents live in `AdminModule` behind a role gate.
 */
@ApiTags('Settings')
@Controller({ path: 'settings', version: '1' })
@Auth()
export class SettingsController {
  public constructor(private readonly settings: SettingsService) {}

  @Patch('profile')
  @ApiOperation({
    summary: 'Update your own profile',
    description:
      'PATCH semantics: an absent field is left alone. `phone` and ' +
      '`avatarUrl` are nullable as well as optional, because clearing a ' +
      'value and not mentioning it are different requests.\n\n' +
      'Email is not editable here. Changing it requires re-verifying the ' +
      'new address while the old one still works, which is a flow of its ' +
      'own rather than a field on this form.',
  })
  @ApiOkResponse({ description: 'The updated profile.', type: UserSummaryDto })
  @ApiConflictResponse({
    description: 'Another account already uses that phone number.',
    ...PROBLEM_DETAILS,
  })
  public async updateProfile(
    @Body() body: UpdateProfileRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserSummaryDto> {
    return this.settings.updateProfile(user.id, body);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  /* Tighter than the global limit and keyed by IP. Guessing the *current*
     password from a stolen session is exactly what this endpoint would
     otherwise permit at speed, and the account is already identified by the
     token — so the useful key is the machine trying. */
  @RateLimit({
    name: 'change-password-ip',
    limit: 5,
    windowSeconds: 900,
    by: 'ip',
  })
  @ApiOperation({
    summary: 'Change your password',
    description:
      'Requires the current password even though you are signed in. A ' +
      'valid token can be a borrowed laptop; the current password is the ' +
      'thing only the account holder knows, and this is the one operation ' +
      'that could lock the owner out permanently.\n\n' +
      '**Every session is signed out, including this one.** That is the ' +
      'point of changing a password after losing a device — a change that ' +
      'left existing refresh tokens working would do nothing for the case ' +
      'people actually use it for. Sign in again with the new password.',
  })
  @ApiNoContentResponse({ description: 'Changed. All sessions revoked.' })
  @ApiUnprocessableEntityResponse({
    description:
      'The current password did not match (`CURRENT_PASSWORD_INCORRECT`).',
    ...PROBLEM_DETAILS,
  })
  public async changePassword(
    @Body() body: ChangePasswordRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.settings.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Which notification categories you have switched off',
    description:
      'Returns the muted kinds, not a map of booleans. Only the exceptions ' +
      'are stored, so a category added after you last changed anything is ' +
      'on — you cannot have opted out of something that did not exist.',
  })
  @ApiOkResponse({ type: NotificationSettingsDto })
  public async notifications(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationSettingsDto> {
    return this.settings.getNotificationSettings(user.id);
  }

  @Put('notifications')
  @ApiOperation({
    summary: 'Replace which categories are switched off',
    description:
      'PUT rather than PATCH: the body is the complete set of mutes, which ' +
      'is what a screen full of switches actually knows.\n\n' +
      'Ride events cannot be muted, and a request naming them is accepted ' +
      'with those entries ignored rather than refused. Silencing them ' +
      'would produce a rider who never learns their driver arrived and ' +
      'concludes the app is broken.',
  })
  @ApiOkResponse({ type: NotificationSettingsDto })
  public async updateNotifications(
    @Body() body: UpdateNotificationSettingsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationSettingsDto> {
    return this.settings.updateNotificationSettings(user.id, body.muted);
  }
}
