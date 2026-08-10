import { ErrorCode, errorTypeUri, type ProblemDetails } from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import { ApiError, toApiError } from './api-error';

const VALIDATION_PROBLEM: ProblemDetails = {
  type: errorTypeUri(ErrorCode.VALIDATION_FAILED),
  title: 'Validation failed',
  status: 400,
  code: ErrorCode.VALIDATION_FAILED,
  detail: 'One or more fields are invalid.',
  errors: [
    { path: 'email', message: 'Enter a valid email address' },
    { path: 'password', message: 'Password must be at least 12 characters' },
  ],
};

/** An AxiosError carrying a real HTTP response. */
function responseError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };

  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('toApiError', () => {
  it('keeps a problem-details body intact', () => {
    const error = toApiError(responseError(400, VALIDATION_PROBLEM));

    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.status).toBe(400);
    expect(error.message).toBe('One or more fields are invalid.');
  });

  it('exposes a field message for the input that caused it', () => {
    /* The only reason `errors` carries a path: a form renders server-side
       validation inline against the offending input rather than as one
       banner that makes the user hunt. */
    const error = toApiError(responseError(400, VALIDATION_PROBLEM));

    expect(error.messageFor('email')).toBe('Enter a valid email address');
    expect(error.messageFor('fullName')).toBeUndefined();
  });

  it('does not read a non-problem body as if it were one', () => {
    /* A proxy's HTML error page, or a truncated payload. Read as
       problem-details, `body.code` is undefined and every downstream branch
       silently takes its else — which is how a 502 comes to be rendered as
       a validation error. */
    const error = toApiError(responseError(502, '<html>Bad Gateway</html>'));

    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.status).toBe(502);
  });

  it('reports a request that never reached the server', () => {
    const error = toApiError(
      new AxiosError('Network Error', 'ERR_NETWORK', {
        headers: new AxiosHeaders(),
      }),
    );

    expect(error.code).toBe('NETWORK_ERROR');
    /* Status 0 rather than a real code: claiming 500 would say the server
       answered when nothing did. */
    expect(error.status).toBe(0);
  });

  it('normalises anything else that was thrown', () => {
    const error = toApiError(new TypeError('undefined is not a function'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('passes an ApiError straight through', () => {
    const original = new ApiError(VALIDATION_PROBLEM);

    expect(toApiError(original)).toBe(original);
  });

  it('has an empty field list when nothing was field-level', () => {
    const error = toApiError(
      responseError(409, {
        type: errorTypeUri('RIDER_ALREADY_ON_RIDE'),
        title: 'You are already on a ride',
        status: 409,
        code: 'RIDER_ALREADY_ON_RIDE',
      }),
    );

    expect(error.fieldErrors).toEqual([]);
  });
});
