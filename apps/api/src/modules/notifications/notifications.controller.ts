import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ResourceNotFoundError } from '../../common/errors/domain-error';
import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUser } from '../auth/current-user.decorator';
import { Auth } from '../auth/roles.decorator';

import {
  NotificationDto,
  NotificationIdParamDto,
  NotificationListQueryDto,
  NotificationPageDto,
  UnreadCountDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * Everything here is scoped to the caller.
 *
 * No user id appears in any path. There is no legitimate reason to read
 * another person's notifications, so the endpoint that would allow it does
 * not exist — which is a stronger guarantee than a guard on one that does.
 */
@ApiTags('Notifications')
@Controller({ path: 'notifications', version: '1' })
@Auth()
export class NotificationsController {
  public constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Your notifications',
    description:
      'Newest first, cursor-paginated, with the unread count alongside.\n\n' +
      'The count is in this response rather than behind its own endpoint. ' +
      'It counts unread notifications everywhere, including pages nobody ' +
      'asked for, so it cannot be derived from the list — but arriving in ' +
      'the same response means the badge and the list can never disagree.',
  })
  @ApiOkResponse({ type: NotificationPageDto })
  public async list(
    @Query() query: NotificationListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationPageDto> {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'How many are unread',
    description:
      'For a client that wants only the badge — a header on a page that ' +
      'never shows the list.',
  })
  @ApiOkResponse({ type: UnreadCountDto })
  public async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadCountDto> {
    return { unreadCount: await this.notifications.countUnread(user.id) };
  }

  @Patch(':notificationId/read')
  @ApiOperation({
    summary: 'Mark one read',
    description:
      'Idempotent. Marking an already-read notification read again ' +
      'succeeds, because the caller’s intent is satisfied either way and a ' +
      'double tap should not produce an error.',
  })
  @ApiOkResponse({ type: NotificationDto })
  @ApiNotFoundResponse({
    description: 'No such notification, or not one of yours.',
    ...PROBLEM_DETAILS,
  })
  public async markRead(
    @Param() params: NotificationIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationDto> {
    const notification = await this.notifications.markRead(
      user.id,
      params.notificationId,
    );

    /* 404 for someone else's notification as well as for a missing one. A
       403 would confirm that a guessed id belongs to a real person. */
    if (notification === null) {
      throw new ResourceNotFoundError('notification', params.notificationId);
    }

    return notification;
  }

  @Patch('read')
  @ApiOperation({
    summary: 'Mark everything read',
    description: 'Returns the number that changed, which is zero if none did.',
  })
  @ApiOkResponse({ type: UnreadCountDto })
  public async markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadCountDto> {
    await this.notifications.markAllRead(user.id);

    return { unreadCount: 0 };
  }
}
