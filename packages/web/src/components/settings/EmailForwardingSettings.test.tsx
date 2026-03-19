import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailForwardingSettings } from './EmailForwardingSettings.js';

const FORWARDING_ADDRESS = 'a1b2c3d4e5f60789@fwd.todoapp.io';
const ACCOUNT_EMAIL = 'alice@example.com';

describe('EmailForwardingSettings', () => {
  it('displays the forwarding address', () => {
    render(
      <EmailForwardingSettings
        forwardingAddress={FORWARDING_ADDRESS}
        accountEmail={ACCOUNT_EMAIL}
      />,
    );
    expect(screen.getByTestId('forwarding-address')).toHaveTextContent(FORWARDING_ADDRESS);
  });

  it('displays the account email in instructional text', () => {
    render(
      <EmailForwardingSettings
        forwardingAddress={FORWARDING_ADDRESS}
        accountEmail={ACCOUNT_EMAIL}
      />,
    );
    expect(screen.getByTestId('account-email')).toHaveTextContent(ACCOUNT_EMAIL);
  });

  it('copy button calls clipboardWriter with the forwarding address', async () => {
    const clipboardWriter = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <EmailForwardingSettings
        forwardingAddress={FORWARDING_ADDRESS}
        accountEmail={ACCOUNT_EMAIL}
        clipboardWriter={clipboardWriter}
      />,
    );

    await user.click(screen.getByTestId('copy-address-btn'));
    expect(clipboardWriter).toHaveBeenCalledWith(FORWARDING_ADDRESS);
  });

  it('shows "Copied!" feedback immediately after copy', async () => {
    const clipboardWriter = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <EmailForwardingSettings
        forwardingAddress={FORWARDING_ADDRESS}
        accountEmail={ACCOUNT_EMAIL}
        clipboardWriter={clipboardWriter}
      />,
    );

    await user.click(screen.getByTestId('copy-address-btn'));
    expect(screen.getByTestId('copy-address-btn')).toHaveTextContent('Copied!');
  });

  it('has accessible label on the copy button', () => {
    render(
      <EmailForwardingSettings
        forwardingAddress={FORWARDING_ADDRESS}
        accountEmail={ACCOUNT_EMAIL}
      />,
    );
    expect(screen.getByTestId('copy-address-btn')).toHaveAttribute(
      'aria-label',
      'Copy forwarding address',
    );
  });

  it('renders the section with accessible heading', () => {
    render(
      <EmailForwardingSettings
        forwardingAddress={FORWARDING_ADDRESS}
        accountEmail={ACCOUNT_EMAIL}
      />,
    );
    expect(screen.getByRole('heading', { name: /email forwarding/i })).toBeInTheDocument();
  });
});
