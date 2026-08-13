import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type AuthenticatedUser } from '../auth/authenticated-request';
import { CurrentUser } from '../auth/current-user.decorator';
import { Auth } from '../auth/roles.decorator';

import { SearchQueryDto, SearchResponseDto } from './dto/search.dto';
import { SearchService } from './search.service';

/**
 * One box over the rider's places, their rides, and the help articles.
 *
 * Authenticated, because two of the three sources are the caller's own data
 * and there is no coherent anonymous version of "your rides". Help alone is
 * reachable without signing in through the help page itself.
 */
@ApiTags('Search')
@Controller({ path: 'search', version: '1' })
@Auth()
export class SearchController {
  public constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Search your places, rides and help',
    description:
      'Grouped by kind in a fixed order — places, then rides, then help — ' +
      'not merged by a relevance score. Scoring a ride against a help ' +
      'article would mean inventing a number with no unit, so the grouping ' +
      'does that work instead. Each group is ranked by a rule that means ' +
      'something within it.',
  })
  @ApiOkResponse({ type: SearchResponseDto })
  public async find(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SearchResponseDto> {
    return this.search.search(user.id, query.q, query.limit);
  }
}
