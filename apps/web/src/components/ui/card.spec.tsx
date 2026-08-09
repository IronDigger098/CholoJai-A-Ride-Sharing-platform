import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { Card } from './card';

describe('Card', () => {
  it('renders a div by default', () => {
    const { container } = render(<Card>Body</Card>);

    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  it('renders as another element when asked', () => {
    /* The point of `as`. A step in an ordered sequence is a list item;
       forcing a div here would mean nesting the meaningful element inside
       a meaningless one, or losing the list semantics entirely. */
    render(
      <ol>
        <Card as="li">Step one</Card>
      </ol>,
    );

    expect(screen.getByRole('listitem')).toHaveTextContent('Step one');
  });

  it('forwards attributes to the element', () => {
    render(
      <Card as="article" aria-label="Example fare">
        Body
      </Card>,
    );

    expect(screen.getByRole('article', { name: 'Example fare' })).toBeVisible();
  });

  it('keeps caller classes alongside its own', () => {
    // The safety section inverts the surface, so overriding must work.
    const { container } = render(<Card className="bg-surface">Body</Card>);

    expect(container.firstElementChild).toHaveClass('bg-surface');
    expect(container.firstElementChild).toHaveClass('rounded-xl');
  });
});
