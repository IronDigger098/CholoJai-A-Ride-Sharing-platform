import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { Auth } from '../auth/roles.decorator';

import {
  ReverseGeocodeQueryDto,
  ReverseGeocodeResponseDto,
  RouteRequestDto,
  RouteResponseDto,
  SearchPlacesQueryDto,
  SearchPlacesResponseDto,
} from './dto/route.dto';
import { GeoService } from './geo.service';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * Geo — the routing proxy.
 *
 * `POST` rather than `GET` for something that reads nothing: the payload is
 * a structured pair of coordinate objects, and flattening it into a query
 * string would mean inventing an encoding and hand-parsing floats. The
 * response is cached server-side, so the usual argument for a cacheable GET
 * buys nothing here.
 *
 * Authenticated, though it exposes no user data. An open routing proxy is a
 * free OSRM relay for anyone who finds it, billed to us and rate-limited
 * against our address by the upstream.
 */
@ApiTags('Geo')
@Controller({ path: 'geo', version: '1' })
@Auth()
export class GeoController {
  public constructor(private readonly geoService: GeoService) {}

  @Post('route')
  @HttpCode(HttpStatus.OK)
  /* Per IP, not per user, because `RateLimitKeySource` has no user option
     and inventing one for a single caller is the abstraction-without-a-
     second-caller that contributing.md forbids. `api-design.md` specifies
     60/min per user for the quote endpoint this feeds; when M5.3 lands and
     there are two callers wanting it, the key source is worth adding. */
  @RateLimit({
    name: 'geo-route-ip',
    limit: 60,
    windowSeconds: 60,
    by: 'ip',
  })
  @ApiOperation({
    summary: 'Measure a driving route',
    description:
      'Returns the driving distance in metres and duration in seconds ' +
      'between two points. This is what a fare is priced from — the ' +
      'browser never calls a routing provider directly (ADR-006), so ' +
      'the result can be cached across users and the provider can be ' +
      'swapped without a frontend release.\n\n' +
      'Results are cached on an ~11 metre grid. Two requests that round ' +
      'to the same grid square are treated as the same journey.',
  })
  @ApiOkResponse({
    description: 'The measured route.',
    type: RouteResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Both points are valid but no driving route connects them. ' +
      'Retrying will not change this.',
    ...PROBLEM_DETAILS,
  })
  @ApiServiceUnavailableResponse({
    description:
      'The routing provider did not answer. The request was fine — retry ' +
      'shortly.',
    ...PROBLEM_DETAILS,
  })
  public async route(@Body() body: RouteRequestDto): Promise<RouteResponseDto> {
    return this.geoService.route(body.pickup, body.dropoff);
  }

  @Get('search')
  @RateLimit({
    name: 'geo-search-ip',
    limit: 120,
    windowSeconds: 60,
    by: 'ip',
  })
  @ApiOperation({
    summary: 'Search for a place',
    description:
      'Free-text place search, biased toward Bangladesh but not limited ' +
      'to it — a filter would refuse a legitimate cross-border address, ' +
      'whereas a bias just ranks the local match first.\n\n' +
      'Results are cached on the normalised query. A debounced picker ' +
      'still fires often, and the upstream policy caps total volume rather ' +
      'than rate, so a shared cache is what keeps this within it.',
  })
  @ApiOkResponse({
    description: 'Matching places, best first. Empty when nothing matches.',
    type: SearchPlacesResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'The geocoder did not answer. Retry shortly.',
    ...PROBLEM_DETAILS,
  })
  public async search(
    @Query() query: SearchPlacesQueryDto,
  ): Promise<SearchPlacesResponseDto> {
    return { places: [...(await this.geoService.searchPlaces(query.q))] };
  }

  @Get('reverse')
  @RateLimit({
    name: 'geo-reverse-ip',
    limit: 120,
    windowSeconds: 60,
    by: 'ip',
  })
  @ApiOperation({
    summary: 'The place at a point',
    description:
      'Turns a dropped pin into an address.\n\n' +
      'Answers `{ "place": null }` rather than 404 when there is nothing ' +
      'there. Dropping a pin in the middle of a river is an ordinary thing ' +
      'to do with a map, and "no address here" is a result, not a failure.',
  })
  @ApiOkResponse({
    description: 'The place, or `{ "place": null }`.',
    type: ReverseGeocodeResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'The geocoder did not answer. Retry shortly.',
    ...PROBLEM_DETAILS,
  })
  public async reverse(
    @Query() query: ReverseGeocodeQueryDto,
  ): Promise<ReverseGeocodeResponseDto> {
    return {
      place: await this.geoService.reverseGeocode({
        lat: query.lat,
        lng: query.lng,
      }),
    };
  }
}
