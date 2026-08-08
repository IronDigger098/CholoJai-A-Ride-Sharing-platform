import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { type Request, type Response } from 'express';

import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';

import { RefreshTokenStaleError } from './auth.errors';
import { AuthService } from './auth.service';
import { type AuthenticatedUser } from './authenticated-request';
import { CurrentUser } from './current-user.decorator';
import {
  LoginRequestDto,
  LoginResponseDto,
  MeResponseDto,
  RefreshResponseDto,
} from './dto/login.dto';
import { RegisterRequestDto, RegisterResponseDto } from './dto/register.dto';
import {
  ResendVerificationRequestDto,
  VerifyEmailRequestDto,
  VerifyEmailResponseDto,
} from './dto/verify-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshCookieService } from './refresh-cookie.service';

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
  public constructor(
    private readonly authService: AuthService,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  /* Registration writes a row and sends an email, so the abuse is spam and
     mailbox-bombing rather than credential guessing. Keyed by IP only: the
     email address on a registration is by definition one we have never
     seen, so a per-email counter would have exactly one hit every time. */
  @RateLimit({
    name: 'register-ip',
    limit: 10,
    windowSeconds: 3600,
    by: 'ip',
  })
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
  /* Tokens are 256 bits of randomness, so guessing is not the threat —
     volume is. This is a ceiling on brute-force noise, not a defence
     against it. */
  @RateLimit({
    name: 'verify-email-ip',
    limit: 30,
    windowSeconds: 3600,
    by: 'ip',
  })
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
  /* Each call sends a real email to an address the caller chooses, which
     makes an unthrottled endpoint here a mail-bombing tool aimed at
     someone else. The per-email rule is the one that protects the victim;
     the per-IP rule protects our sending reputation. */
  @RateLimit(
    {
      name: 'resend-email',
      limit: 3,
      windowSeconds: 3600,
      by: { bodyField: 'email' },
    },
    { name: 'resend-ip', limit: 10, windowSeconds: 3600, by: 'ip' },
  )
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

  /**
   * `@Res({ passthrough: true })` is important.
   *
   * Injecting the response object without it hands routing entirely to us:
   * Nest stops serialising the returned value and the request hangs unless
   * we call `res.json()` ourselves. `passthrough` means "let me set a
   * header, you still send the body" — so the return value below is still
   * validated and serialised the same way as every other endpoint's.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  /* The endpoint this whole milestone exists for. Every attempt costs ~50ms
     of argon2, and it is the front door for credential stuffing.
  
     Two rules, because either alone leaves a hole. Per-email stops a
     distributed attack on one account no matter how many addresses it comes
     from. Per-IP stops one machine working through a wordlist across many
     accounts — and is the looser of the two on purpose, because an office
     or a mobile carrier can put hundreds of legitimate users behind one
     address, and five per IP would lock out a whole building. */
  @RateLimit(
    {
      name: 'login-email',
      limit: 5,
      windowSeconds: 900,
      by: { bodyField: 'email' },
    },
    { name: 'login-ip', limit: 20, windowSeconds: 900, by: 'ip' },
  )
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Exchanges an email and password for a session.\n\n' +
      'Two credentials come back by two different routes. The **access ' +
      'token** is in the response body: keep it in memory and send it as ' +
      '`Authorization: Bearer <token>`. The **refresh token** is set as an ' +
      'httpOnly cookie and is never exposed to JavaScript — the browser ' +
      'attaches it automatically to `/api/v1/auth` requests.\n\n' +
      'Do not store the access token in `localStorage`. Any script running ' +
      'on the page can read it there, which is exactly what the httpOnly ' +
      'cookie exists to prevent for the longer-lived half.\n\n' +
      'An unverified account can sign in. Endpoints that require a ' +
      'verified address enforce it individually; check `user.emailVerified` ' +
      'to decide whether to prompt.',
  })
  @ApiOkResponse({ description: 'Signed in.', type: LoginResponseDto })
  @ApiBadRequestResponse({
    description: 'The request body is malformed.',
    ...PROBLEM_DETAILS,
  })
  @ApiUnauthorizedResponse({
    description:
      'The email address or password is incorrect. One response covers ' +
      'both, so this endpoint cannot be used to discover which addresses ' +
      'have accounts.',
    ...PROBLEM_DETAILS,
  })
  public async login(
    @Body() body: LoginRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const { response: payload, refreshToken } =
      await this.authService.login(body);

    this.refreshCookie.set(response, refreshToken);

    return payload;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  /* A legitimate client refreshes roughly four times an hour per device.
     This leaves room for a household of devices behind one address while
     still capping anyone feeding us guessed cookies. */
  @RateLimit({
    name: 'refresh-ip',
    limit: 120,
    windowSeconds: 3600,
    by: 'ip',
  })
  @ApiOperation({
    summary: 'Refresh the session',
    description:
      'Exchanges the refresh cookie for a new access token and a new ' +
      'refresh cookie. Takes no request body and no access token — it has ' +
      'to work precisely when the access token is dead, which is the only ' +
      'time anyone calls it.\n\n' +
      '**Rotation.** Each refresh token is single-use. Every call retires ' +
      'the one presented and issues a successor in the same family.\n\n' +
      '**Reuse detection.** A token that was already rotated should not ' +
      'exist anywhere, so presenting one means a copy escaped. The entire ' +
      'family is revoked and both the user and whoever holds the copy are ' +
      'signed out; only the party who knows the password can return.\n\n' +
      '**Handling the three failures.** `REFRESH_TOKEN_STALE` means a ' +
      'concurrent request won the race — retry once, the new cookie is ' +
      'already set. `REFRESH_TOKEN_REUSED` means the session was revoked ' +
      'for security; tell the user why. `REFRESH_TOKEN_INVALID` means send ' +
      'them to sign in.\n\n' +
      'Sessions are also bounded absolutely: rotation slides the window ' +
      'forward but never past thirty days from the original sign-in.',
  })
  @ApiOkResponse({
    description: 'Session refreshed.',
    type: RefreshResponseDto,
  })
  @ApiUnauthorizedResponse({
    description:
      'Branch on `code`: `REFRESH_TOKEN_STALE` (retry), ' +
      '`REFRESH_TOKEN_REUSED` (revoked for security), or ' +
      '`REFRESH_TOKEN_INVALID` (sign in again).',
    ...PROBLEM_DETAILS,
  })
  public async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponseDto> {
    try {
      const { response: payload, refreshToken } =
        await this.authService.refresh(this.refreshCookie.read(request));

      this.refreshCookie.set(response, refreshToken);

      return payload;
    } catch (error: unknown) {
      /* Clear the dead cookie so the browser stops sending it — but NOT on
         a stale race. There, the request that won has already set the new
         cookie, and this response arriving second with a clear instruction
         would delete the good credential and sign out the very user the
         grace window exists to protect. */
      if (!(error instanceof RefreshTokenStaleError)) {
        this.refreshCookie.clear(response);
      }

      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the refresh token in the cookie — and every token descended ' +
      'from the same sign-in — then clears the cookie.\n\n' +
      'Requires no access token, deliberately: the sign-out button must ' +
      'keep working after the access token has expired, which it does every ' +
      'fifteen minutes.\n\n' +
      'Always 204, whether or not the cookie was present or still valid. ' +
      'The caller is signed out either way.\n\n' +
      'The access token is not revoked and stays valid until it expires. ' +
      'That is the accepted cost of stateless tokens: revoking one would ' +
      'mean a database lookup on every authenticated request, which is the ' +
      'entire thing a JWT is chosen to avoid.',
  })
  @ApiNoContentResponse({ description: 'Signed out.' })
  public async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.refreshCookie.read(request));

    /* Cleared unconditionally. If revocation failed for a token we could
       not find, the browser should still stop sending it. */
    this.refreshCookie.clear(response);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the signed-in user',
    description:
      'Returns the current profile, read from the database rather than ' +
      'decoded from the access token.\n\n' +
      'That distinction matters: a token carries the roles the user had ' +
      'when it was issued, up to fifteen minutes ago. After a driver ' +
      'application is approved, this endpoint is how the client learns the ' +
      'new role before the next refresh.',
  })
  @ApiOkResponse({ description: 'The current user.', type: MeResponseDto })
  @ApiUnauthorizedResponse({
    description:
      'No access token, or one that is invalid or expired. `code` ' +
      'distinguishes `ACCESS_TOKEN_EXPIRED` — refresh and retry — from ' +
      '`INVALID_ACCESS_TOKEN`, which means sign in again.',
    ...PROBLEM_DETAILS,
  })
  @ApiNotFoundResponse({
    description: 'The account has been deleted since the token was issued.',
    ...PROBLEM_DETAILS,
  })
  public async me(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MeResponseDto> {
    return this.authService.getProfile(user.id);
  }
}
