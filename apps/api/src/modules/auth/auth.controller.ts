import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { RegisterRequestDto, RegisterResponseDto } from './dto/register.dto';

/**
 * Authentication endpoints.
 *
 * The controller does exactly three things: declare the route, declare the
 * contract, and hand off. No business logic, no database access, no error
 * construction — a violation of that is a review comment, because the
 * moment logic appears here it becomes untestable without an HTTP layer
 * (architecture §3).
 */
@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Registers a rider account and sends a verification email. The ' +
      'account exists immediately but is unverified — `emailVerified` is ' +
      'false until the link is used.\n\n' +
      'Roles cannot be requested: every new account is granted RIDER only. ' +
      'Becoming a driver is a separate reviewed application.',
  })
  @ApiCreatedResponse({
    description: 'Account created.',
    type: RegisterResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed. `errors` lists each offending field.',
    schema: { $ref: '#/components/schemas/ProblemDetails' },
  })
  @ApiConflictResponse({
    description: 'An account already exists with this email address.',
    schema: { $ref: '#/components/schemas/ProblemDetails' },
  })
  public async register(
    @Body() body: RegisterRequestDto,
  ): Promise<RegisterResponseDto> {
    return this.authService.register(body);
  }
}
