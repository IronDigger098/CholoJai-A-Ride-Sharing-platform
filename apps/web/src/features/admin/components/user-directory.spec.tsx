import { type UserPage, UserRole, type UserSummary } from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UserDirectory } from './user-directory';

import { renderWithProviders } from '@/testing/render-with-providers';

function makeUser(
  id: string,
  fullName: string,
  roles: UserRole[],
): UserSummary {
  return {
    id,
    fullName,
    email: `${id}@cholojai.test`,
    phone: null,
    avatarUrl: null,
    emailVerified: true,
    roles,
    createdAt: '2026-08-01T09:00:00.000Z',
  };
}

const NABILA = makeUser('user_1', 'Nabila Rahman', [UserRole.RIDER]);
const IMRAN = makeUser('user_2', 'Imran Hossain', [
  UserRole.RIDER,
  UserRole.DRIVER,
]);

function page(data: UserSummary[], nextCursor: string | null = null): UserPage {
  return { data, pageInfo: { nextCursor, hasNextPage: nextCursor !== null } };
}

const mockListUsers = jest.fn();
const mockGrantRole = jest.fn();
const mockRevokeRole = jest.fn();

jest.mock('../api', () => ({
  listUsers: (query: unknown) => mockListUsers(query),
  grantRole: (input: unknown) => mockGrantRole(input),
  revokeRole: (input: unknown) => mockRevokeRole(input),
}));

describe('UserDirectory', () => {
  beforeEach(() => {
    mockListUsers.mockReset();
    mockGrantRole.mockReset();
    mockRevokeRole.mockReset();
    mockListUsers.mockResolvedValue(page([NABILA, IMRAN]));
    mockGrantRole.mockResolvedValue(NABILA);
    mockRevokeRole.mockResolvedValue(IMRAN);
  });

  it('lists users with the roles they hold', async () => {
    renderWithProviders(<UserDirectory />);

    expect(await screen.findByText('Nabila Rahman')).toBeVisible();
    expect(screen.getByText('Rider · Driver')).toBeVisible();
  });

  it('does not search until the search is submitted', async () => {
    /* The deliberate difference from the booking screen's place lookup. An
       administrator types a whole name and presses enter once; a query per
       keystroke would buy nothing and cost a request each. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<UserDirectory />);

    await screen.findByText('Nabila Rahman');
    await user.type(screen.getByLabelText('Search'), 'nabila');

    expect(mockListUsers).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(mockListUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'nabila' }),
      );
    });
  });

  it('narrows the directory to a role', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<UserDirectory />);

    await screen.findByText('Nabila Rahman');
    await user.selectOptions(screen.getByLabelText('Role'), UserRole.DRIVER);

    await waitFor(() => {
      expect(mockListUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: UserRole.DRIVER }),
      );
    });
  });

  it('grants a role the user does not hold', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<UserDirectory />);

    /* Only Nabila is offered it — Imran already drives, so his control is
       the revoking one. That is why this can be a single match. */
    await user.click(
      await screen.findByRole('button', { name: 'Make driver' }),
    );

    expect(mockGrantRole).toHaveBeenCalledWith({
      userId: 'user_1',
      role: UserRole.DRIVER,
    });
  });

  it('revokes a role the user holds', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<UserDirectory />);

    await user.click(
      await screen.findByRole('button', { name: 'Remove driver' }),
    );

    expect(mockRevokeRole).toHaveBeenCalledWith({
      userId: 'user_2',
      role: UserRole.DRIVER,
    });
  });

  it('offers no control for the rider role', async () => {
    /* Every account holds it and the API refuses to revoke it, so a button
       for it could only ever fail. */
    renderWithProviders(<UserDirectory />);

    await screen.findByText('Nabila Rahman');

    expect(
      screen.queryByRole('button', { name: 'Remove rider' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces a refusal from the server', async () => {
    /* An administrator removing their own ADMIN role is a 409, and the
       message has to reach the person who tried. */
    mockRevokeRole.mockRejectedValue(new Error('Cannot revoke'));
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<UserDirectory />);

    await user.click(
      await screen.findByRole('button', { name: 'Remove driver' }),
    );

    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('asks for the next page with the cursor it was given', async () => {
    mockListUsers.mockImplementation((query: { cursor?: string }) =>
      Promise.resolve(
        query.cursor === undefined ? page([NABILA], 'user_1') : page([IMRAN]),
      ),
    );
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<UserDirectory />);

    await user.click(await screen.findByRole('button', { name: 'Show more' }));

    await waitFor(() => {
      expect(mockListUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'user_1' }),
      );
    });
    expect(await screen.findByText('Imran Hossain')).toBeVisible();
  });
});
