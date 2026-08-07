import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { RegisterRequestDto, RegisterResponseDto } from './dto/register.dto';
import {
  ResendVerificationRequestDto,
  VerifyEmailRequestDto,
  VerifyEmailResponseDto,
} from './dto/verify-email.dto';

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

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
    ...PROBLEM_DETAILS,
  })
  @ApiConflictResponse({
    description: 'An account already exists with this email address.',
    ...PROBLEM_DETAILS,
  })
  public async register(
    @Body() body: RegisterRequestDto,
  ): Promise<RegisterResponseDto> {
    return this.authService.register(body);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm an email address',
    description:
      'Consumes a verification token. Tokens are single-use and expire ' +
      'after 24 hours.\n\n' +
      'The token is sent in the request body rather than the URL: a query ' +
      'parameter would be captured by browser history, server access logs, ' +
      'and the Referer header sent to any third-party asset on the page.',
  })
  @ApiOkResponse({
    description: 'Email verified.',
    type: VerifyEmailResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The token is unknown, expired, or already used. All three share one ' +
      'response so that guessing tokens reveals nothing.',
    ...PROBLEM_DETAILS,
  })
  public async verifyEmail(
    @Body() body: VerifyEmailRequestDto,
  ): Promise<VerifyEmailResponseDto> {
    return this.authService.verifyEmail(body.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Request a new verification email',
    description:
      'Always returns 204, whether or not the address exists and whether ' +
      'or not it is already verified.\n\n' +
      'Answering honestly would turn this into a bulk address-checking ' +
      'oracle, and the caller gains nothing from the distinction — the ' +
      'next step is to check the inbox either way.\n\n' +
      'Issuing a new link invalidates any previous one.',
  })
  @ApiNoContentResponse({ description: 'Request accepted.' })
  @ApiBadRequestResponse({
    description: 'The email address is malformed.',
    ...PROBLEM_DETAILS,
  })
  public async resendVerification(
    @Body() body: ResendVerificationRequestDto,
  ): Promise<void> {
    await this.authService.resendVerification(body.email);
  }
}
