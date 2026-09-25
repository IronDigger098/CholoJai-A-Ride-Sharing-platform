import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react';

import { RegisterForm } from '../features/auth/components/register-form';
import { ContactForm } from '../features/contact/components/contact-form';

import { renderWithProviders } from '@/testing/render-with-providers';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * The screens M10c moved onto the catalogues really do render in Bangla.
 *
 * `messages.spec.ts` proves the two files have the same keys; it cannot
 * prove a component reads them rather than a literal left behind. These
 * render real forms with the Bangla catalogue and look for Bangla where the
 * English used to be hard-coded.
 */
describe('Bangla coverage', () => {
  it('renders the registration form in Bangla', () => {
    renderWithProviders(<RegisterForm />, 'bn');

    expect(screen.getByLabelText('পুরো নাম')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'অ্যাকাউন্ট খুলুন' }),
    ).toBeInTheDocument();
  });

  it('renders the contact form in Bangla', () => {
    renderWithProviders(<ContactForm />, 'bn');

    expect(screen.getByLabelText('আপনার নাম')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'বার্তা পাঠান' }),
    ).toBeInTheDocument();
  });
});
