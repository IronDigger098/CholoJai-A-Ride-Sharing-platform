import { ApiProperty } from '@nestjs/swagger';

/**
 * Liveness response.
 *
 * A class rather than an interface because `@nestjs/swagger` reads runtime
 * decorator metadata to generate the OpenAPI schema — an interface is
 * erased at compile time and leaves nothing to inspect. This is the one
 * place we accept a class where a type would otherwise do.
 */
export class HealthResponseDto {
  @ApiProperty({
    example: 'ok',
    description: 'Always "ok" — a failing process cannot answer at all.',
  })
  public readonly status!: 'ok';

  @ApiProperty({
    example: 128.42,
    description: 'Seconds since this process started.',
  })
  public readonly uptimeSeconds!: number;

  @ApiProperty({
    example: '2026-08-07T02:31:00.000Z',
    description: 'Server time in UTC, for detecting clock drift.',
  })
  public readonly timestamp!: string;

  @ApiProperty({
    example: '0.1.0',
    description: 'Deployed application version.',
  })
  public readonly version!: string;
}
