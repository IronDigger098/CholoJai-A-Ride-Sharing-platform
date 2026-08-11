import { type Coupon, CouponKind } from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CampaignManager } from './campaign-manager';

import { renderWithProviders } from '@/testing/render-with-providers';

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'coupon_1',
    code: 'WELCOME10',
    kind: CouponKind.PERCENT,
    value: 10,
    maxDiscountPaisa: null,
    minFarePaisa: 0,
    maxRedemptions: null,
    perUserLimit: 1,
    redeemedCount: 0,
    firstRideOnly: false,
    startsAt: '2026-08-01T09:00:00.000Z',
    endsAt: null,
    isActive: true,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

const mockListCoupons = jest.fn();
const mockCreateCoupon = jest.fn();
const mockUpdateCoupon = jest.fn();

jest.mock('../api', () => ({
  listCoupons: () => mockListCoupons(),
  createCoupon: (request: unknown) => mockCreateCoupon(request),
  updateCoupon: (input: unknown) => mockUpdateCoupon(input),
}));

/** Fill the two fields with no default and submit. */
async function createCampaign(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.type(screen.getByLabelText('Code'), 'welcome10');
  await user.type(screen.getByLabelText('Percent off'), '10');
  await user.click(screen.getByRole('button', { name: 'Create campaign' }));
}

describe('CampaignManager', () => {
  beforeEach(() => {
    mockListCoupons.mockReset();
    mockCreateCoupon.mockReset();
    mockUpdateCoupon.mockReset();
    mockListCoupons.mockResolvedValue([makeCoupon()]);
    mockCreateCoupon.mockResolvedValue(makeCoupon());
    mockUpdateCoupon.mockResolvedValue(makeCoupon({ isActive: false }));
  });

  it('describes what each campaign does and to whom', async () => {
    mockListCoupons.mockResolvedValue([
      makeCoupon({ minFarePaisa: 20_000, firstRideOnly: true }),
    ]);

    renderWithProviders(<CampaignManager />);

    expect(await screen.findByText('WELCOME10')).toBeVisible();
    expect(
      screen.getByText(
        '10% off · fares over ৳200 · first ride only · once per rider',
      ),
    ).toBeVisible();
  });

  it('reports the budget against what has been spent', async () => {
    mockListCoupons.mockResolvedValue([
      makeCoupon({ maxRedemptions: 500, redeemedCount: 137 }),
    ]);

    renderWithProviders(<CampaignManager />);

    expect(await screen.findByText('137 used of 500')).toBeVisible();
  });

  it('sends the code and starts the campaign now', async () => {
    /* `startsAt` is not a field. A campaign being filled in is one the
       administrator wants running, and a start date would mostly be a way
       to typo a launch into next year. */
    const before = Date.now();
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CampaignManager />);

    await createCampaign(user);

    await waitFor(() => {
      expect(mockCreateCoupon).toHaveBeenCalledTimes(1);
    });

    const request = mockCreateCoupon.mock.calls[0]?.[0] as {
      code: string;
      startsAt: string;
      perUserLimit: number;
    };

    /* Sent as typed. The contract uppercases it, so a component that also
       uppercased would hide a change to that rule rather than surface it. */
    expect(request.code).toBe('welcome10');
    expect(Date.parse(request.startsAt)).toBeGreaterThanOrEqual(before);
    expect(request.perUserLimit).toBe(1);
  });

  it('omits an unset budget rather than sending a zero', async () => {
    /* Blank means "no limit", and zero means "nobody may use it". The
       optional field has to be absent, not falsy. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CampaignManager />);

    await createCampaign(user);

    await waitFor(() => {
      expect(mockCreateCoupon).toHaveBeenCalledTimes(1);
    });

    expect(mockCreateCoupon.mock.calls[0]?.[0]).not.toHaveProperty(
      'maxRedemptions',
    );
  });

  it('converts a minimum fare from taka to paisa', async () => {
    /* The form talks taka because administrators do; the wire is paisa
       because money is an integer. A form that sent 200 would build a
       campaign a hundred times easier to qualify for than intended. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CampaignManager />);

    await user.type(screen.getByLabelText('Minimum fare (৳)'), '200');
    await createCampaign(user);

    await waitFor(() => {
      expect(mockCreateCoupon).toHaveBeenCalledTimes(1);
    });

    expect(mockCreateCoupon.mock.calls[0]?.[0]).toMatchObject({
      minFarePaisa: 20_000,
    });
  });

  it('retires a campaign without deleting it', async () => {
    /* `redeemedCount` is the record of what a campaign cost. A row that can
       be removed is an accounting hole. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CampaignManager />);

    await user.click(await screen.findByRole('button', { name: 'Retire' }));

    await waitFor(() => {
      expect(mockUpdateCoupon).toHaveBeenCalledWith({
        couponId: 'coupon_1',
        changes: { isActive: false },
      });
    });
  });

  it('offers no way to retire one already retired', async () => {
    mockListCoupons.mockResolvedValue([makeCoupon({ isActive: false })]);

    renderWithProviders(<CampaignManager />);

    expect(await screen.findByText(/retired/u)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Retire' }),
    ).not.toBeInTheDocument();
  });

  it('reports a refused code without clearing what was typed', async () => {
    /* Re-typing a whole campaign because one field collided is the kind of
       thing that makes an administrator create `WELCOME10-2`. */
    mockCreateCoupon.mockRejectedValue(new Error('That code already exists.'));
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CampaignManager />);

    await createCampaign(user);

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByLabelText('Code')).toHaveValue('welcome10');
  });
});
