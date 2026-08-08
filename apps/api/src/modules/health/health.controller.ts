import {
  Controller,
  Get,
  HttpStatus,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';

import { SkipRateLimit } from '../../common/rate-limit/rate-limit.decorator';

import { HealthResponseDto } from './dto/health-response.dto';
import { ReadinessResponseDto } from './dto/readiness-response.dto';
import { HealthService } from './health.service';

/**
 * Liveness and readiness probes.
 *
 * Deliberately **unversioned** and outside the `/api/v1` prefix
 * (docs/api-design.md §4). A load balancer or container orchestrator asking
 * "is this process alive?" should not have to know, or track, which version
 * of the business API it happens to be serving. Versioning is a contract
 * with API *clients*; infrastructure is not a client.
 */
@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
/* Exempt from rate limiting. A load balancer polls these every second or
   two from a single address; counted against the global per-IP limit it
   would exhaust the budget on its own and start receiving 429s — the probe
   would then report the instance unhealthy and remove it from rotation,
   causing precisely the outage it exists to detect. */
@SkipRateLimit()
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness: is this process running and able to respond?
   *
   * Checks nothing external, deliberately. If liveness depended on the
   * database, a brief database blip would make the orchestrator kill and
   * restart every healthy API instance — turning a recoverable dependency
   * outage into a full self-inflicted outage. Dependencies belong in
   * readiness, which controls traffic rather than process lifetime.
   */
  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Returns 200 whenever the process is running. Checks no external ' +
      'dependencies — see the readiness probe for those.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  public getLiveness(): HealthResponseDto {
    return this.healthService.getLiveness();
  }

  /**
   * Readiness: should this instance receive traffic?
   *
   * Returns 503 when a dependency is unreachable, which is what removes
   * the instance from a load balancer's rotation. The body still describes
   * *which* dependency failed, so an operator does not have to go digging.
   */
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Returns 200 when every dependency is reachable, 503 otherwise. ' +
      'A load balancer uses this to decide whether to route traffic here.',
  })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'At least one dependency is unreachable.',
    type: ReadinessResponseDto,
  })
  public async getReadiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponseDto> {
    const readiness = await this.healthService.getReadiness();

    /* Set the status directly rather than throwing. This is not an error
       to be reported through the problem-details filter — it is a normal,
       expected answer to "are you ready?", and the caller is a load
       balancer that wants the structured body, not an RFC 9457 document. */
    response.status(
      readiness.status === 'ready'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return readiness;
  }
}
