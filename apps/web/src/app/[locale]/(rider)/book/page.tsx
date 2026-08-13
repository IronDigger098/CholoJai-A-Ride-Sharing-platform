import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { BookingForm } from '@/features/booking/components/booking-form';

export const metadata: Metadata = {
  title: 'Book a ride',
  robots: { index: false, follow: false },
};

export default function BookPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Book a ride</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        The price you are shown is the price you pay.
      </p>

      <BookingForm />
    </>
  );
}
