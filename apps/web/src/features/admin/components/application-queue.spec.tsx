import {
  type DriverApplication,
  DriverApplicationStatus,
} from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApplicationQueue } from './application-queue';

import { renderWithProviders } from '@/testing/render-with-providers';

const APPLICATION: DriverApplication = {
  id: 'driver_1',
  userId: 'user_1',
  fullName: 'Nabila Rahman',
  email: 'nabila@cholojai.test',
  applicationStatus: DriverApplicationStatus.PENDING,
  rejectionReason: null,
  licenseNoMasked: '••••7890',
  isAvailable: false,
  ratingAvgX100: 0,
  ratingCount: 0,
  approvedAt: null,
  createdAt: '2026-08-01T09:00:00.000Z',
};

const mockList = jest.fn();
const mockApprove = jest.fn();
const mockReject = jest.fn();

jest.mock('../api', () => ({
  listDriverApplications: (status: string) => mockList(status),
  approveDriverApplication: (id: string) => mockApprove(id),
  rejectDriverApplication: (input: unknown) => mockReject(input),
}));

describe('ApplicationQueue', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockApprove.mockReset();
    mockReject.mockReset();
    mockList.mockResolvedValue([APPLICATION]);
    mockApprove.mockResolvedValue({});
    mockReject.mockResolvedValue({});
  });

  it('opens on the pending queue', async () => {
    /* The default the API also uses. An admin arriving at this screen wants
       the work, not the archive. */
    renderWithProviders(<ApplicationQueue />);

    expect(await screen.findByText('Nabila Rahman')).toBeVisible();
    expect(mockList).toHaveBeenCalledWith(DriverApplicationStatus.PENDING);
  });

  it('approves an application', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ApplicationQueue />);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(mockApprove).toHaveBeenCalledWith('driver_1');
  });

  it('asks for a reason before rejecting', async () => {
    /* Rejecting is two actions, not one. The reason field is the
       confirmation step, which is why there is no separate one. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ApplicationQueue />);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(screen.getByLabelText('Reason for rejection')).toBeVisible();
    expect(mockReject).not.toHaveBeenCalled();
  });

  it('refuses a reason too short to act on', async () => {
    /* The same rule the server enforces, checked here so the applicant's
       rejection is never recorded as "no". */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ApplicationQueue />);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.type(screen.getByLabelText('Reason for rejection'), 'no');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(mockReject).not.toHaveBeenCalled();
  });

  it('sends the reason with the rejection', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ApplicationQueue />);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.type(
      screen.getByLabelText('Reason for rejection'),
      'Licence expired',
    );
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    expect(mockReject).toHaveBeenCalledWith({
      driverProfileId: 'driver_1',
      reason: 'Licence expired',
    });
  });

  it('reloads the queue when the filter changes', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ApplicationQueue />);

    await screen.findByText('Nabila Rahman');
    await user.selectOptions(
      screen.getByLabelText('Showing'),
      DriverApplicationStatus.APPROVED,
    );

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(DriverApplicationStatus.APPROVED);
    });
  });

  it('surfaces a refusal from the server', async () => {
    /* Two administrators working the same queue: the second decision is a
       409, and it has to reach the person who made it. */
    mockApprove.mockRejectedValue(new Error('Already decided'));
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ApplicationQueue />);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
