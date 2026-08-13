import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LocaleSwitcher } from './locale-switcher';

import { renderWithProviders } from '@/testing/render-with-providers';

const mockReplace = jest.fn();
const mockPathname = jest.fn();

/* Relative, not `@/i18n/navigation`. `jest.mock` resolves its argument
   through the module resolver rather than the compiler, and the path alias
   is not available to it here — the same reason every other mock in this
   codebase names a relative path. The component still imports the alias;
   both resolve to one file, and the mock is registered against that. */
jest.mock('../../i18n/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname(),
}));

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPathname.mockReset();
    mockPathname.mockReturnValue('/');
  });

  it('names each language in that language', async () => {
    renderWithProviders(<LocaleSwitcher />);

    /* Endonyms. Somebody looking for Bangla is looking for "বাংলা", and a
       list that says "Bengali" is only usable by people who already read
       English — which is the group least likely to need the control. */
    expect(await screen.findByRole('option', { name: 'বাংলা' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'English' })).toBeVisible();
  });

  it('shows the language currently in use as selected', () => {
    renderWithProviders(<LocaleSwitcher />, 'bn');

    expect(screen.getByRole('combobox')).toHaveValue('bn');
  });

  it('stays on the same page when the language changes', async () => {
    /* The property worth testing. Somebody on a ride detail page who
       switches to Bangla wants that ride in Bangla, not the landing page —
       and sending them home is the easy implementation of this control. */
    mockPathname.mockReturnValue('/rides/abc123');

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<LocaleSwitcher />);

    await user.selectOptions(screen.getByRole('combobox'), 'bn');

    expect(mockReplace).toHaveBeenCalledWith('/rides/abc123', { locale: 'bn' });
  });

  it('replaces rather than pushes', async () => {
    /* Changing language is not a navigation somebody wants to undo with
       Back — pushing would mean Back returns them to the same page in the
       language they just rejected. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<LocaleSwitcher />);

    await user.selectOptions(screen.getByRole('combobox'), 'bn');

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('is labelled for a screen reader', () => {
    /* A select whose purpose is carried by its selected value alone
       announces as "English, combo box", which does not say what changing
       it would do. */
    renderWithProviders(<LocaleSwitcher />);

    expect(screen.getByRole('combobox', { name: 'Language' })).toBeVisible();
  });
});
