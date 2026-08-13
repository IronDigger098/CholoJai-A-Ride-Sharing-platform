import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUser } from '../auth/current-user.decorator';
import { Auth } from '../auth/roles.decorator';

import {
  CreateSavedPlaceRequestDto,
  SavedPlaceDto,
  SavedPlaceIdParamDto,
  SavedPlaceListDto,
} from './dto/places.dto';
import { PlacesService } from './places.service';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * A rider's saved places.
 *
 * Scoped to the caller by construction — no route takes a user id — the same
 * shape as settings. Deleting somebody else's place answers 404 rather than
 * 403, so a probe cannot learn which ids are real.
 */
@ApiTags('Places')
@Controller({ path: 'places', version: '1' })
@Auth()
export class PlacesController {
  public constructor(private readonly places: PlacesService) {}

  @Get()
  @ApiOperation({
    summary: 'Your saved places',
    description:
      'Oldest first — the order you built the list in. Unpaginated: a ' +
      'rider has a handful, and this list cannot grow without them ' +
      'deliberately growing it.',
  })
  @ApiOkResponse({ type: SavedPlaceListDto })
  public async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SavedPlaceListDto> {
    return { places: [...(await this.places.list(user.id))] };
  }

  @Post()
  @ApiOperation({
    summary: 'Save a place',
    description:
      'The coordinates are stored alongside the address text rather than ' +
      'looked up again when used. A geocoder can return a different point ' +
      'for the same string a year later, and the rider saved a spot on a ' +
      'map — that spot is what they meant.',
  })
  @ApiCreatedResponse({ type: SavedPlaceDto })
  @ApiConflictResponse({
    description: 'The list is full (`TOO_MANY_SAVED_PLACES`).',
    ...PROBLEM_DETAILS,
  })
  public async create(
    @Body() body: CreateSavedPlaceRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SavedPlaceDto> {
    return this.places.create(user.id, body);
  }

  @Delete(':placeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a saved place',
    description:
      'Hard delete. A saved place is a convenience the rider made and can ' +
      'unmake — unlike a ride, it is not history and nothing references it.',
  })
  @ApiNoContentResponse({ description: 'Removed.' })
  @ApiNotFoundResponse({
    description: 'No such place, or not yours.',
    ...PROBLEM_DETAILS,
  })
  public async remove(
    @Param() params: SavedPlaceIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.places.remove(user.id, params.placeId);
  }
}
