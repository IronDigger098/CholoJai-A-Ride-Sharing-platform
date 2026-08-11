import { UserRole } from '@cholojai/shared';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Auth } from '../auth/roles.decorator';

import { ContactMessageNotFoundError } from './contact.errors';
import { ContactService } from './contact.service';
import {
  ContactMessageDto,
  ContactMessageIdParamDto,
  ContactMessageListQueryDto,
  ContactMessagePageDto,
  SetContactMessageHandledRequestDto,
} from './dto/contact.dto';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * The support inbox.
 *
 * A second controller in this module rather than more routes on the first,
 * because the two have opposite audiences: one is open to the world and the
 * other is administrators only. Splitting them lets the gate sit on the
 * class, where a route added later inherits it.
 */
@ApiTags('Admin')
@Controller({ path: 'admin/contact-messages', version: '1' })
@Auth(UserRole.ADMIN)
export class ContactMessagesController {
  public constructor(private readonly contact: ContactService) {}

  @Get()
  @ApiOperation({
    summary: 'Read the support inbox',
    description:
      'Oldest first, cursor-paginated, unhandled by default — the ' +
      'unfiltered request returns the work rather than the archive.\n\n' +
      'Oldest first is the opposite of every other list in this API and is ' +
      'deliberate: a newest-first inbox pushes the messages that have ' +
      'waited longest onto pages nobody scrolls to, so the rows most overdue ' +
      'for an answer become the ones least likely to be read.',
  })
  @ApiOkResponse({ type: ContactMessagePageDto })
  public async list(
    @Query() query: ContactMessageListQueryDto,
  ): Promise<ContactMessagePageDto> {
    return this.contact.list(query);
  }

  @Patch(':messageId')
  @ApiOperation({
    summary: 'Mark a message handled, or put it back',
    description:
      'Reversible on purpose. Handling records who still owes a reply, not ' +
      'a transition with consequences — and a one-way checkbox turns a ' +
      'single misclick into a message nobody ever looks at again.',
  })
  @ApiOkResponse({ type: ContactMessageDto })
  @ApiNotFoundResponse({
    description: 'No message has that id.',
    ...PROBLEM_DETAILS,
  })
  public async setHandled(
    @Param() params: ContactMessageIdParamDto,
    @Body() body: SetContactMessageHandledRequestDto,
  ): Promise<ContactMessageDto> {
    const message = await this.contact.setHandled(
      params.messageId,
      body.handled,
    );

    if (message === null) {
      throw new ContactMessageNotFoundError(params.messageId);
    }

    return message;
  }
}
