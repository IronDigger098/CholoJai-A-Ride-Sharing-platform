import { type ContactMessage, type ContactMessagePage } from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SupportInbox } from './support-inbox';

import { renderWithProviders } from '@/testing/render-with-providers';

function makeMessage(overrides: Partial<ContactMessage> = {}): ContactMessage {
  return {
    id: 'contact_1',
    name: 'Nabila Rahman',
    email: 'nabila@example.test',
    subject: 'Driver took a longer route',
    message: 'My ride went the wrong way and cost more than quoted.',
    userId: null,
    handledAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

function page(data: ContactMessage[]): ContactMessagePage {
  return { data, pageInfo: { nextCursor: null, hasNextPage: false } };
}

const mockList = jest.fn();
const mockSetHandled = jest.fn();

jest.mock('../api', () => ({
  listContactMessages: (query: unknown) => mockList(query),
  setContactMessageHandled: (input: unknown) => mockSetHandled(input),
}));

describe('SupportInbox', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockSetHandled.mockReset();
    mockList.mockResolvedValue(page([makeMessage()]));
    mockSetHandled.mockResolvedValue(
      makeMessage({ handledAt: '2026-08-02T09:00:00.000Z' }),
    );
  });

  it('opens on the work rather than the archive', async () => {
    renderWithProviders(<SupportInbox />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });
    expect(mockList.mock.calls[0]?.[0]).toMatchObject({ handled: false });
  });

  it('shows who wrote and what they said', async () => {
    renderWithProviders(<SupportInbox />);

    expect(await screen.findByText('Driver took a longer route')).toBeVisible();
    expect(screen.getByText(/nabila@example.test/u)).toBeVisible();
    expect(screen.getByText(/wrong way/u)).toBeVisible();
  });

  it('says plainly when the sender held no account', async () => {
    /* The address was typed and proves nothing. Showing an account link
       built from it would attach a real person to a stranger's message. */
    renderWithProviders(<SupportInbox />);

    expect(await screen.findByText(/not signed in/u)).toBeVisible();
  });

  it('switches to the archive when asked', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SupportInbox />);

    await user.click(await screen.findByRole('button', { name: 'Handled' }));

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ handled: true }),
      );
    });
  });

  it('marks a waiting message handled', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SupportInbox />);

    await user.click(
      await screen.findByRole('button', { name: 'Mark handled' }),
    );

    await waitFor(() => {
      expect(mockSetHandled).toHaveBeenCalledWith({
        messageId: 'contact_1',
        handled: true,
      });
    });
  });

  it('offers to reopen one already handled', async () => {
    /* Reversible on purpose: a one-way checkbox turns a single misclick
       into a message nobody ever looks at again. */
    mockList.mockResolvedValue(
      page([makeMessage({ handledAt: '2026-08-02T09:00:00.000Z' })]),
    );

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SupportInbox />);

    await user.click(await screen.findByRole('button', { name: 'Reopen' }));

    await waitFor(() => {
      expect(mockSetHandled).toHaveBeenCalledWith({
        messageId: 'contact_1',
        handled: false,
      });
    });
  });

  it('says so when nothing is waiting', async () => {
    mockList.mockResolvedValue(page([]));

    renderWithProviders(<SupportInbox />);

    expect(await screen.findByText('Nothing is waiting.')).toBeVisible();
  });
});
