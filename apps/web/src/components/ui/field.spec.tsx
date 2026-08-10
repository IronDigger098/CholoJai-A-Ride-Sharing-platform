import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { Field } from './field';

/**
 * Assertions about what assistive technology perceives, not about classes.
 *
 * The wiring is the whole reason this component exists: a red border is
 * invisible to a screen reader, and a field that is announced without its
 * error leaves the user guessing why the form was refused.
 */
describe('Field', () => {
  it('binds its label to its input', () => {
    render(<Field id="email" label="Email address" />);

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('is not marked invalid until it has an error', () => {
    render(<Field id="email" label="Email address" />);

    expect(screen.getByLabelText('Email address')).not.toHaveAttribute(
      'aria-invalid',
    );
  });

  it('announces the error and marks the field invalid', () => {
    render(<Field id="email" label="Email address" error="Enter an email" />);

    const input = screen.getByLabelText('Email address');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter an email');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an email');
  });

  it('keeps the hint described alongside the error', () => {
    /* Dropping the hint when an error appears removes the rule the user
       needs in order to fix it — which is precisely when they need it. */
    render(
      <Field
        id="password"
        label="Password"
        hint="At least 12 characters."
        error="Too short"
      />,
    );

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'At least 12 characters. Too short',
    );
  });

  it('passes input attributes through', () => {
    render(
      <Field
        id="email"
        label="Email address"
        type="email"
        autoComplete="email"
      />,
    );

    const input = screen.getByLabelText('Email address');

    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
  });
});
