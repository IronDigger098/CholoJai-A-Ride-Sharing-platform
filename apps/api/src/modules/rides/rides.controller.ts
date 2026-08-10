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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUser } from '../auth/current-user.decorator';
import { Auth } from '../auth/roles.decorator';

import {
  ActiveRideResponseDto,
  BookRideRequestDto,
  CancelRideRequestDto,
  RideIdParamDto,
  RideListQueryDto,
  RidePageResponseDto,
  RideResponseDto,
} from './dto/book-ride.dto';
import { RidesService } from './rides.service';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

@ApiTags('Rides')
@Controller({ path: 'rides', version: '1' })
@Auth()
export class RidesController {
  public constructor(private readonly ridesService: RidesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Book a ride',
    description:
      'Consumes a fare quote and creates a `REQUESTED` ride.\n\n' +
      'The request carries only the quote id and the chosen vehicle type. ' +
      'Everything else — route, distance, price — is read from the quote ' +
      'the server issued, so there is no second source of truth for what ' +
      'the ride costs.\n\n' +
      'The chosen option becomes the ride’s immutable fare snapshot ' +
      '(domain-model.md D2). A later rate change cannot rewrite it, and ' +
      'the database verifies the arithmetic survived the copy with a CHECK ' +
      'constraint.',
  })
  @ApiCreatedResponse({
    description: 'The booked ride, in `REQUESTED`.',
    type: RideResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No quote exists with that id.',
    ...PROBLEM_DETAILS,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The quote has expired (`QUOTE_EXPIRED`) or does not include a price ' +
      'for the chosen vehicle type (`VEHICLE_TYPE_NOT_QUOTED`). Both are ' +
      'fixed by quoting again.',
    ...PROBLEM_DETAILS,
  })
  @ApiConflictResponse({
    description:
      'The rider already has a ride that has not finished. Enforced by a ' +
      'partial unique index, so concurrent requests produce one ride and ' +
      'one conflict rather than two rides.',
    ...PROBLEM_DETAILS,
  })
  public async book(
    @Body() body: BookRideRequestDto,
    @CurrentUser() rider: AuthenticatedUser,
  ): Promise<RideResponseDto> {
    return this.ridesService.book(rider.id, body);
  }

  @Get()
  @ApiOperation({
    summary: 'My rides',
    description:
      'The caller’s ride history, newest first, cursor paginated.\n\n' +
      'Scoped to the token holder — there is no `riderId` parameter, ' +
      'because "whose history?" is not a decision the request gets to ' +
      'make.\n\n' +
      'Cursor rather than offset (api-design.md §3): history is written to ' +
      'while it is read, and an offset shifts the moment a new ride is ' +
      'inserted, so the reader sees a duplicate or misses a row.',
  })
  @ApiOkResponse({
    description: 'A page of rides, with `pageInfo.nextCursor` if more exist.',
    type: RidePageResponseDto,
  })
  public async list(
    @Query() query: RideListQueryDto,
    @CurrentUser() rider: AuthenticatedUser,
  ): Promise<RidePageResponseDto> {
    return this.ridesService.list(rider.id, query);
  }

  /**
   * Declared before `:rideId`, and it has to stay that way.
   *
   * Nest matches routes in declaration order, so a `:rideId` route defined
   * above this one would capture the literal path `active` and send it to
   * the database as a ride id. The failure is a confusing 404 rather than
   * an error, which is exactly the kind that survives review.
   */
  @Get('active')
  @ApiOperation({
    summary: 'My current ride',
    description:
      'The caller’s ride that has not reached a terminal state, or `null`.' +
      '\n\nWrapped rather than answering 204: having no ride in progress is ' +
      'an ordinary state, not an absence of content, and one response ' +
      'shape is easier to consume than two that depend on the status code.',
  })
  @ApiOkResponse({
    description: 'The active ride, or `{ "ride": null }`.',
    type: ActiveRideResponseDto,
  })
  public async active(
    @CurrentUser() rider: AuthenticatedUser,
  ): Promise<ActiveRideResponseDto> {
    return { ride: await this.ridesService.findActive(rider.id) };
  }

  @Get(':rideId')
  @ApiOperation({
    summary: 'Ride detail',
    description:
      'A single ride the caller owns. A ride belonging to someone else ' +
      'answers 404 rather than 403 — a 403 would tell anyone guessing ids ' +
      'which ones are real.',
  })
  @ApiOkResponse({ description: 'The ride.', type: RideResponseDto })
  @ApiNotFoundResponse({
    description: 'No such ride, or not the caller’s.',
    ...PROBLEM_DETAILS,
  })
  public async detail(
    @Param() params: RideIdParamDto,
    @CurrentUser() rider: AuthenticatedUser,
  ): Promise<RideResponseDto> {
    return this.ridesService.findForRider(rider.id, params.rideId);
  }

  /**
   * The documented exception to "no verbs in URLs" (api-design.md §Rides).
   *
   * `POST /rides/:id/cancel` is honest about invoking a guarded transition.
   * `PATCH /rides/:id {"status": "CANCELLED"}` would imply the client may
   * set any status, which puts the state machine in the client's hands —
   * and this route maps to exactly one arrow in the domain model's diagram.
   */
  @Post(':rideId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a ride',
    description:
      'Cancels a ride the caller owns, recording `cancelledBy: RIDER` and ' +
      'an optional reason.\n\n' +
      'Which states allow this comes from `RIDE_TRANSITIONS` in ' +
      '`packages/shared`, the same table the web app derives its buttons ' +
      'from. A ride that is already `IN_PROGRESS` cannot be cancelled — ' +
      'its only successor is `COMPLETED`.\n\n' +
      'The move is applied as one conditional statement, so two requests ' +
      'racing each other produce one cancellation and one 409 rather than ' +
      'two writes.',
  })
  @ApiOkResponse({ description: 'The cancelled ride.', type: RideResponseDto })
  @ApiNotFoundResponse({
    description:
      'No ride with that id, or not the caller’s. Both answer 404 — a 403 ' +
      'would confirm that a guessed id is real.',
    ...PROBLEM_DETAILS,
  })
  @ApiConflictResponse({
    description:
      'The state machine forbids the move (`ILLEGAL_RIDE_TRANSITION`), ' +
      'either because the ride is in a state that cannot be cancelled or ' +
      'because it left that state while the request was in flight.',
    ...PROBLEM_DETAILS,
  })
  public async cancel(
    @Param() params: RideIdParamDto,
    @Body() body: CancelRideRequestDto,
    @CurrentUser() rider: AuthenticatedUser,
  ): Promise<RideResponseDto> {
    return this.ridesService.cancel(rider.id, params.rideId, body.reason);
  }
}
