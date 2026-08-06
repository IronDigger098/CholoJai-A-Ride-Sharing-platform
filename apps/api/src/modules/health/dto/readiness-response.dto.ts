import { ApiProperty } from '@nestjs/swagger';

/** Per-dependency result inside a readiness report. */
export class DependencyStatusDto {
  @ApiProperty({ example: 'up', enum: ['up', 'down'] })
  public readonly status!: 'up' | 'down';

  @ApiProperty({
    example: 3,
    description: 'Milliseconds the check took.',
  })
  public readonly latencyMs!: number;
}

export class ReadinessResponseDto {
  @ApiProperty({
    example: 'ready',
    enum: ['ready', 'not_ready'],
    description:
      'Whether this instance should receive traffic. Unlike liveness, ' +
      'this DOES depend on external services.',
  })
  public readonly status!: 'ready' | 'not_ready';

  @ApiProperty({ type: DependencyStatusDto })
  public readonly database!: DependencyStatusDto;

  @ApiProperty({ example: '2026-08-07T02:31:00.000Z' })
  public readonly timestamp!: string;
}
