import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './button';

/**
 * These tests assert behaviour, not classes.
 *
 * `expect(button.className).toContain('bg-action')` would pass for a
 * button nobody can click and fail for a redesign that changed nothing a
 * user can perceive. Everything below is something a person or a screen
 * reader would notice.
 */
describe('Button', () => {
  it('is found by its accessible name', () => {
    render(<Button>Book a ride</Button>);

    expect(screen.getByRole('button', { name: 'Book a ride' })).toBeVisible();
  });

  it('defaults to type="button" rather than submitting', () => {
    /* HTML's default is "submit". A button dropped into a form to open a
       dialog would submit that form instead — a bug that appears only once
       the component is reused inside a form, far from where it was
       written. */
    render(<Button>Cancel</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('still allows an explicit submit', () => {
    render(<Button type="submit">Sign in</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('calls the handler on click', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Press</Button>);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('activates from the keyboard', async () => {
    /* A real button does this for free — which is the point. The test
       exists so that a future refactor to a <div onClick> fails here
       instead of silently locking out anyone not using a mouse. */
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Press</Button>);

    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  describe('when disabled', () => {
    it('is announced as disabled', () => {
      // Not "looks faded": `disabled` is what assistive technology reads.
      render(<Button disabled>Press</Button>);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('does not fire its handler', async () => {
      const onClick = jest.fn();
      render(
        <Button disabled onClick={onClick}>
          Press
        </Button>,
      );

      await userEvent.click(screen.getByRole('button'));

      expect(onClick).not.toHaveBeenCalled();
    });

    it('is skipped by keyboard navigation', async () => {
      render(<Button disabled>Press</Button>);

      await userEvent.tab();

      expect(screen.getByRole('button')).not.toHaveFocus();
    });
  });

  it('forwards arbitrary attributes', () => {
    /* A primitive that swallows props forces every consumer to fork it.
       `aria-*` and `data-*` in particular must reach the element. */
    render(
      <Button aria-label="Close" data-testid="close">
        ×
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('data-testid', 'close');
  });

  it('exposes the underlying element through a ref', () => {
    let element: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(node) => {
          element = node;
        }}
      >
        Press
      </Button>,
    );

    expect(element).toBeInstanceOf(HTMLButtonElement);
  });

  it('keeps caller classes alongside its own', () => {
    render(<Button className="mt-8">Press</Button>);

    expect(screen.getByRole('button')).toHaveClass('mt-8');
  });
});
