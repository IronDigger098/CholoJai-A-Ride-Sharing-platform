/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ContactForm } from './contact-form';

import { ApiError } from '@/lib/api-error';
import { renderWithProviders } from '@/testing/render-with-providers';

const mockSubmit = jest.fn();

jest.mock('../api', () => ({
  submitContactMessage: (request: unknown) => mockSubmit(request),
}));

const FILLED = {
  name: 'Nabila Rahman',
  email: 'nabila@example.test',
  subject: 'Driver took a longer route',
  message: 'My ride last night went the wrong way and cost more than quoted.',
};

async function fillAndSend(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<typeof FILLED> = {},
): Promise<void> {
  const values = { ...FILLED, ...overrides };

  await user.type(screen.getByLabelText('Your name'), values.name);
  await user.type(screen.getByLabelText('Email address'), values.email);
  await user.type(screen.getByLabelText('Subject'), values.subject);
  await user.type(screen.getByLabelText('Message'), values.message);
  await user.click(screen.getByRole('button', { name: 'Send message' }));
}

describe('ContactForm', () => {
  beforeEach(() => {
    mockSubmit.mockReset();
    mockSubmit.mockResolvedValue({ id: 'contact_1' });
  });

  it('asks for nothing that requires an account', () => {
    /* The page exists for people who cannot sign in. A form that wanted a
       session would close the door on the cases it is for. */
    renderWithProviders(<ContactForm />);

    expect(screen.getByLabelText('Your name')).toBeVisible();
    expect(screen.getByLabelText('Email address')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /sign in/iu }),
    ).not.toBeInTheDocument();
  });

  it('sends what was typed', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ContactForm />);

    await fillAndSend(user);

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });
    expect(mockSubmit.mock.calls[0]?.[0]).toMatchObject(FILLED);
  });

  it('refuses a message too short to act on before calling the API', async () => {
    /* The same schema the server runs, so the two cannot disagree. Answering
       here costs a round trip nobody needs. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ContactForm />);

    await fillAndSend(user, { message: 'help' });

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('refuses an address a reply could never reach', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ContactForm />);

    await fillAndSend(user, { email: 'not-an-address' });

    expect(screen.getByLabelText('Email address')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('confirms arrival rather than clearing the form', async () => {
    /* A blank form after submitting looks identical to one that failed
       silently, and the one thing somebody writing to support needs to know
       is that it arrived. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ContactForm />);

    await fillAndSend(user);

    expect(await screen.findByRole('status')).toHaveTextContent(/with us/u);
    expect(
      screen.queryByRole('button', { name: 'Send message' }),
    ).not.toBeInTheDocument();
  });

  it('keeps what was typed when the send fails', async () => {
    /* Re-typing a complaint because the network dropped is how somebody
       gives up on telling you about a problem. */
    mockSubmit.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'Too many requests',
        status: 429,
        code: 'RATE_LIMITED',
        detail: 'Please wait a moment and try again.',
      }),
    );

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ContactForm />);

    await fillAndSend(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /wait a moment/u,
    );
    expect(screen.getByLabelText('Subject')).toHaveValue(FILLED.subject);
  });
});
