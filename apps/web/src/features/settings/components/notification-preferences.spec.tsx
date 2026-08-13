import { NotificationKind } from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NotificationPreferences } from './notification-preferences';

import { renderWithProviders } from '@/testing/render-with-providers';

const APPROVED = 'Your driver application is approved';

const mockGet = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../api', () => ({
  getNotificationSettings: () => mockGet(),
  updateNotificationSettings: (request: unknown) => mockUpdate(request),
}));

describe('NotificationPreferences', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUpdate.mockReset();
    mockGet.mockResolvedValue({ muted: [] });
    mockUpdate.mockResolvedValue({ muted: [] });
  });

  it('shows a category nobody muted as on', async () => {
    /* The inversion this component exists for: the wire carries mutes and a
       person thinks in terms of what they want. */
    renderWithProviders(<NotificationPreferences />);

    expect(await screen.findByLabelText(APPROVED)).toBeChecked();
  });

  it('shows a muted category as off', async () => {
    mockGet.mockResolvedValue({
      muted: [NotificationKind.DRIVER_APPLICATION_APPROVED],
    });

    renderWithProviders(<NotificationPreferences />);

    expect(await screen.findByLabelText(APPROVED)).not.toBeChecked();
  });

  it('mutes a category when the switch is turned off', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<NotificationPreferences />);

    await user.click(await screen.findByLabelText(APPROVED));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        muted: [NotificationKind.DRIVER_APPLICATION_APPROVED],
      });
    });
  });

  it('unmutes by sending the set without it, not by sending it again', async () => {
    /* PUT replaces. Sending the kind a second time would re-mute it, which
       is the bug this test exists to catch. */
    mockGet.mockResolvedValue({
      muted: [NotificationKind.DRIVER_APPLICATION_APPROVED],
    });

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<NotificationPreferences />);

    await user.click(await screen.findByLabelText(APPROVED));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ muted: [] });
    });
  });

  it('never offers a switch for ride events', async () => {
    /* Absent rather than disabled. A switch that cannot move is a question
       the product is refusing to answer. */
    renderWithProviders(<NotificationPreferences />);

    await screen.findByLabelText(APPROVED);

    expect(
      screen.queryByLabelText(/driver accepts your ride/iu),
    ).not.toBeInTheDocument();
  });

  it('says so when saving fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Network unreachable.'));

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<NotificationPreferences />);

    await user.click(await screen.findByLabelText(APPROVED));

    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
