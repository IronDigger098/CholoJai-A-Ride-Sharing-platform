import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUser } from '../auth/current-user.decorator';
import { Auth } from '../auth/roles.decorator';

import { FareQuoteRequestDto, FareQuoteResponseDto } from './dto/quote.dto';
import { FaresService } from './fares.service';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

@ApiTags('Fares')
@Controller({ path: 'fares', version: '1' })
@Auth()
export class FaresController {
  public constructor(private readonly faresService: FaresService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  /* Still per IP. `api-design.md` specifies 60/min per user, and this is now
     the second caller that wants it — but adding a `user` key source means
     touching the guard, which is a change with its own failure modes and
     does not belong in the middle of a pricing slice. Tracked rather than
     forgotten: it is the smallest useful piece of M5.4's branch. */
  @RateLimit({
    name: 'fare-quote-ip',
    limit: 60,
    windowSeconds: 60,
    by: 'ip',
  })
  @ApiOperation({
    summary: 'Price a proposed journey',
    description:
      'Measures the route server-side and returns a priced option per ' +
      'vehicle type, cheapest first, with the full breakdown each one ' +
      'would put on the ride.\n\n' +
      'The client sends two coordinates and receives five numbers per ' +
      'option — it never states the distance, so it cannot price its own ' +
      'ride. Addresses are carried through as display text and do not ' +
      'affect anything.\n\n' +
      'The quote is stored and expires. Booking consumes it by id, and its ' +
      'chosen line becomes the ride’s immutable fare snapshot ' +
      '(domain-model.md D2) — so a later rate change can never rewrite a ' +
      'receipt.',
  })
  @ApiOkResponse({
    description: 'A priced quote, valid until `expiresAt`.',
    type: FareQuoteResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The journey cannot be quoted: no driving route connects the two ' +
      'points (`ROUTE_NOT_FOUND`), or it is longer than we serve ' +
      '(`ROUTE_TOO_LONG`).',
    ...PROBLEM_DETAILS,
  })
  @ApiServiceUnavailableResponse({
    description: 'The routing provider did not answer. Retry shortly.',
    ...PROBLEM_DETAILS,
  })
  public async quote(
    @Body() body: FareQuoteRequestDto,
    @CurrentUser() rider: AuthenticatedUser,
  ): Promise<FareQuoteResponseDto> {
    /* The rider's id is needed even without a code — the per-rider and
       first-ride limits are questions about *them*, and a quote priced for
       nobody in particular could not answer either. */
    return this.faresService.quote(rider.id, body);
  }
}
