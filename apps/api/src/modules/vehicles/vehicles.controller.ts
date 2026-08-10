import { UserRole } from '@cholojai/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
  CreateVehicleRequestDto,
  VehicleDto,
  VehicleIdParamDto,
  VehicleListDto,
} from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * A driver's own vehicles.
 *
 * `@Auth(DRIVER)` at the class, and every method additionally resolves an
 * approved profile. The role is necessary and not sufficient: it can be
 * granted a moment before the application is approved, and a token issued in
 * that window carries a claim its holder cannot yet exercise.
 */
@ApiTags('Vehicles')
@Controller({ path: 'vehicles', version: '1' })
@Auth(UserRole.DRIVER)
export class VehiclesController {
  public constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a vehicle',
    description:
      'The first vehicle a driver registers becomes their active one; ' +
      'later ones do not. Switching automatically would change which ' +
      'vehicle the driver is about to be dispatched in as a side effect of ' +
      'adding another — `PATCH /:id/activate` makes that an explicit act.' +
      '\n\nPlate numbers are normalised (uppercased, spaces and dashes ' +
      'removed) and globally unique: two drivers cannot register the same ' +
      'vehicle, because one of them is not telling the truth and the ' +
      'platform cannot tell which.',
  })
  @ApiCreatedResponse({ type: VehicleDto })
  @ApiForbiddenResponse({
    description: 'No approved driver application.',
    ...PROBLEM_DETAILS,
  })
  @ApiConflictResponse({
    description: 'That plate is already registered.',
    ...PROBLEM_DETAILS,
  })
  public async create(
    @Body() body: CreateVehicleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleDto> {
    return this.vehiclesService.create(user.id, body);
  }

  @Get()
  @ApiOperation({
    summary: 'My vehicles',
    description: 'Active first, then newest.',
  })
  @ApiOkResponse({ type: VehicleListDto })
  public async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleListDto> {
    return { vehicles: [...(await this.vehiclesService.list(user.id))] };
  }

  @Patch(':vehicleId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Make this my active vehicle',
    description:
      'Deactivates the current active vehicle and activates this one, in ' +
      'one transaction. A partial unique index allows a driver only one ' +
      'active vehicle, so the two writes cannot be separate statements — ' +
      'between them the driver would have none, and a failure would leave ' +
      'them with none.',
  })
  @ApiOkResponse({ type: VehicleDto })
  @ApiNotFoundResponse({
    description: 'No such vehicle, or not the caller’s.',
    ...PROBLEM_DETAILS,
  })
  public async activate(
    @Param() params: VehicleIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleDto> {
    return this.vehiclesService.activate(user.id, params.vehicleId);
  }

  @Delete(':vehicleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a vehicle',
    description:
      'A vehicle attached to any ride cannot be removed — a completed ride ' +
      'must keep saying which vehicle carried it, which the database ' +
      'enforces with ON DELETE RESTRICT.',
  })
  @ApiNoContentResponse({ description: 'Removed.' })
  @ApiNotFoundResponse({
    description: 'No such vehicle, or not the caller’s.',
    ...PROBLEM_DETAILS,
  })
  @ApiConflictResponse({
    description: 'The vehicle is part of a ride.',
    ...PROBLEM_DETAILS,
  })
  public async remove(
    @Param() params: VehicleIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.vehiclesService.remove(user.id, params.vehicleId);
  }
}
