import { UserRole } from '@cholojai/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Auth } from '../auth/roles.decorator';

import { AnalyticsService } from './analytics.service';
import {
  PlatformMetricsDto,
  PlatformMetricsQueryDto,
} from './dto/analytics.dto';

/**
 * Platform metrics, served under `/admin`.
 *
 * `@Auth(UserRole.ADMIN)` on the class, like `AdminController`. Aggregates
 * are not individually sensitive, but together they are the platform's
 * revenue and volume — which is a competitor's research, not a rider's
 * business.
 */
@ApiTags('Admin')
@Controller({ path: 'admin/analytics', version: '1' })
@Auth(UserRole.ADMIN)
export class AnalyticsController {
  public constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @ApiOperation({
    summary: 'Platform metrics',
    description:
      'Totals, the current worklist, and finished rides per day.\n\n' +
      'Computed live rather than read from a rollup table. At this volume ' +
      'the aggregates cost less than the job that would keep a summary ' +
      'current, and a number that is always right needs no explanation of ' +
      'how stale it might be.\n\n' +
      '`days` counts whole UTC calendar days ending today, so 7 means today ' +
      'and the six before it rather than the last 168 hours. Every day in ' +
      'the window is returned, including those with no rides — a chart drawn ' +
      'from only the busy days puts the wrong bar where a quiet one belongs.',
  })
  @ApiOkResponse({ type: PlatformMetricsDto })
  public async metrics(
    @Query() query: PlatformMetricsQueryDto,
  ): Promise<PlatformMetricsDto> {
    return this.analytics.metrics(query);
  }
}
