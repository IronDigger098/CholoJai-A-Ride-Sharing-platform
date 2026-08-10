/* `jest` is the global here, not the `@jest/globals` import the other specs
   use. `jest.mock` must be hoisted above the module imports to replace them,
   and it cannot be hoisted above the import that would define `jest` — so
   importing it silently leaves the real module in place. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { type Session, type SessionStatus } from '../session';

import { RequireSession } from './require-session';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

/* `mock` prefix required — jest.mock is hoisted above the imports and its
   factory may only close over variables named this way. */
let mockStatus: SessionStatus = 'loading';

jest.mock('../session', () => ({
  useSession: (): Session => ({
    status: mockStatus,
    user: null,
    /* Not `async () => {}` — an empty function body is a lint error, and
       these are never called: the component reads only `status`. */
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  }),
}));

describe('RequireSession', () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  it('renders nothing of the page while the session is unknown', () => {
    /* The case a boolean would get wrong. On reload the access token is
       gone until the refresh cookie is exchanged; redirecting here bounces
       a signed-in rider to /login on every navigation. */
    mockStatus = 'loading';
    render(
      <RequireSession>
        <p>Booking form</p>
      </RequireSession>,
    );

    expect(screen.queryByText('Booking form')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sends an anonymous visitor to sign in', () => {
    mockStatus = 'anonymous';
    render(
      <RequireSession>
        <p>Booking form</p>
      </RequireSession>,
    );

    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Booking form')).not.toBeInTheDocument();
  });

  it('renders the page for a signed-in rider', () => {
    mockStatus = 'authenticated';
    render(
      <RequireSession>
        <p>Booking form</p>
      </RequireSession>,
    );

    expect(screen.getByText('Booking form')).toBeVisible();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
