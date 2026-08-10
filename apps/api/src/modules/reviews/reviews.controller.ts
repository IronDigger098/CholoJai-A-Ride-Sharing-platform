import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUser } from '../auth/current-user.decorator';
import { Auth } from '../auth/roles.decorator';
import { RideIdParamDto } from '../rides/dto/book-ride.dto';

import {
  CreateReviewRequestDto,
  MyReviewResponseDto,
  ReviewDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * Ratings, nested under the ride they belong to.
 *
 * `/rides/:rideId/review` rather than `/reviews` with a ride id in the body.
 * A review has no life of its own — it cannot exist without the journey, it
 * is found by the journey, and there is exactly one per rider per ride. The
 * URL says all of that; a flat collection would say none of it.
 *
 * The controller lives in the reviews module while its path lives under
 * rides, the same split as `admin/driver-applications` (architecture.md §3).
 */
@ApiTags('Reviews')
@Controller({ path: 'rides/:rideId/review', version: '1' })
@Auth()
export class ReviewsController {
  public constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Rate a completed ride',
    description:
      'One rating per rider per ride, enforced by a unique index rather ' +
      'than a read — two taps on a slow connection would both pass a ' +
      'read-then-write check and count one journey twice in the driver’s ' +
      'average.\n\n' +
      'The comment is optional on purpose. Requiring a sentence is how a ' +
      'rating form becomes a form nobody fills in, and the star is the part ' +
      'the platform can act on.\n\n' +
      'Storing the rating also refreshes the driver’s average, in the same ' +
      'transaction. The average is a cache of what this table already says, ' +
      'and a failure between the two writes would leave it permanently ' +
      'disagreeing with its own source.',
  })
  @ApiCreatedResponse({ type: ReviewDto })
  @ApiNotFoundResponse({
    description: 'No such ride, or not one of yours.',
    ...PROBLEM_DETAILS,
  })
  @ApiConflictResponse({
    description:
      'The ride has not finished, never had a driver, or has already been ' +
      'rated.',
    ...PROBLEM_DETAILS,
  })
  public async submit(
    @Param() params: RideIdParamDto,
    @Body() body: CreateReviewRequestDto,
    @CurrentUser() rider: AuthenticatedUser,
  ): Promise<ReviewDto> {
    return this.reviews.submit(rider.id, params.rideId, body);
  }

  @Get()
  @ApiOperation({
    summary: 'Your rating of a ride',
    description:
      'Wrapped in an object with a nullable field rather than answering ' +
      '404. Not having rated a journey yet is the ordinary state, not a ' +
      'missing resource.',
  })
  @ApiOkResponse({ type: MyReviewResponseDto })
  @ApiNotFoundResponse({
    description: 'No such ride, or not one of yours.',
    ...PROBLEM_DETAILS,
  })
  public async findMine(
    @Param() params: RideIdParamDto,
    @CurrentUser() rider: AuthenticatedUser,
  ): Promise<MyReviewResponseDto> {
    return { review: await this.reviews.findMine(rider.id, params.rideId) };
  }
}
