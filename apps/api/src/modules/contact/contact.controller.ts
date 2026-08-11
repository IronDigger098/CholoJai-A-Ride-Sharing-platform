import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiCreatedResponse } from '@nestjs/swagger';

import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUserOrNull } from '../auth/current-user.decorator';
import { OptionalAuth } from '../auth/optional-auth.guard';

import { ContactService } from './contact.service';
import {
  ContactMessageDto,
  SubmitContactMessageRequestDto,
} from './dto/contact.dto';

/**
 * Writing to support.
 *
 * The only write in this API that does not require an account. Somebody who
 * cannot sign in is precisely the person who needs to reach support, so
 * gating this would close the door on the cases it exists for.
 *
 * `@OptionalAuth()` therefore identifies rather than admits: a signed-in
 * sender gets their message linked to their account, and everyone else is
 * let through unchanged.
 */
@ApiTags('Contact')
@Controller({ path: 'contact', version: '1' })
@OptionalAuth()
export class ContactController {
  public constructor(private readonly contact: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  /* Tighter than the global per-IP limit, and by IP because there is no
     account to key on. Five an hour is generous for a person and useless
     for a script — an unauthenticated write endpoint is found by scanners
     within hours of being deployed. */
  @RateLimit({
    name: 'contact-ip',
    limit: 5,
    windowSeconds: 3600,
    by: 'ip',
  })
  @ApiOperation({
    summary: 'Write to support',
    description:
      'Open to anyone, signed in or not.\n\n' +
      'The name and email are stored as typed, and are not checked against ' +
      'any account. A message from a signed-in sender additionally records ' +
      'which account they held — taken from their token, never matched from ' +
      'the address they typed, because a stranger can type anybody’s.\n\n' +
      'Nothing is sent in reply. The message lands in an inbox an ' +
      'administrator reads.',
  })
  @ApiCreatedResponse({
    description: 'The stored message.',
    type: ContactMessageDto,
  })
  public async submit(
    @Body() body: SubmitContactMessageRequestDto,
    @CurrentUserOrNull() sender: AuthenticatedUser | null,
  ): Promise<ContactMessageDto> {
    return this.contact.submit(body, sender?.id ?? null);
  }
}
