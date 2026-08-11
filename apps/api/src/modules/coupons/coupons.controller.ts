import { UserRole } from '@cholojai/shared';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Auth } from '../auth/roles.decorator';

import { CouponNotFoundError } from './coupons.errors';
import { CouponsService } from './coupons.service';
import {
  CouponDto,
  CouponIdParamDto,
  CouponListDto,
  CreateCouponRequestDto,
  UpdateCouponRequestDto,
} from './dto/coupon.dto';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * Campaign management.
 *
 * Mounted under `admin/` and gated at the class, like every other
 * administrative surface: a route added here later is protected by default
 * rather than by someone remembering a decorator.
 *
 * It lives in this module rather than in `AdminModule` so that the admin
 * surface does not have to import coupons to expose them. The URL says where
 * these endpoints sit in the API; the module says who owns the rules.
 */
@ApiTags('Admin')
@Controller({ path: 'admin/coupons', version: '1' })
@Auth(UserRole.ADMIN)
export class CouponsController {
  public constructor(private readonly coupons: CouponsService) {}

  @Get()
  @ApiOperation({
    summary: 'List campaigns',
    description:
      'Every campaign, running ones first and newest first within that.\n\n' +
      'Not paginated. Campaigns are created by hand, a handful at a time — ' +
      'a cursor here would be machinery for a list that fits on a screen.',
  })
  @ApiOkResponse({ type: CouponListDto })
  public async list(): Promise<CouponListDto> {
    return { coupons: [...(await this.coupons.list())] };
  }

  @Post()
  @ApiOperation({
    summary: 'Create a campaign',
    description:
      'Codes are case-insensitive and stored uppercase, so `welcome10` and ' +
      '`WELCOME10` are one campaign rather than two that behave ' +
      'differently depending on how a rider typed it.\n\n' +
      '`redeemedCount` cannot be set here. It is a fact the platform ' +
      'accumulates; a writable field would let an administrator un-spend a ' +
      'budget.',
  })
  @ApiCreatedResponse({ type: CouponDto })
  @ApiConflictResponse({
    description: 'Another campaign already uses that code.',
    ...PROBLEM_DETAILS,
  })
  public async create(
    @Body() body: CreateCouponRequestDto,
  ): Promise<CouponDto> {
    return this.coupons.create(body);
  }

  @Patch(':couponId')
  @ApiOperation({
    summary: 'Amend or retire a campaign',
    description:
      'Only the four fields that can change while a campaign runs: its ' +
      'budget, its per-rider limit, its end, and whether it is active.\n\n' +
      'The code, the kind and the value are absent on purpose. Changing ' +
      'what a code is worth would change it for quotes already issued at ' +
      'the old price — retiring the campaign and creating another is the ' +
      'honest way to do that.\n\n' +
      'Retiring stops new quotes from using it. Quotes already priced with ' +
      'it stay valid until they expire, because the rider accepted that ' +
      'number (D2).',
  })
  @ApiOkResponse({ type: CouponDto })
  @ApiNotFoundResponse({
    description: 'No campaign has that id.',
    ...PROBLEM_DETAILS,
  })
  public async update(
    @Param() params: CouponIdParamDto,
    @Body() body: UpdateCouponRequestDto,
  ): Promise<CouponDto> {
    const coupon = await this.coupons.update(params.couponId, body);

    /* The service returns null for an unknown id rather than throwing, so
       that a caller who does not care can ignore it. This one cares. */
    if (coupon === null) throw new CouponNotFoundError();

    return coupon;
  }
}
