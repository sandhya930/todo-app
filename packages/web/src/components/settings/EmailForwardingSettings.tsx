import { useCallback, useEffect, useState } from 'react';

interface EmailForwardingSettingsProps {
  /** The user's unique forwarding address, provided by the parent/server. */
  forwardingAddress: string;
  /** The user's registered account email (shown in instructional text). */
  accountEmail: string;
  /**
   * Optional clipboard writer — defaults to navigator.clipboard.writeText.
   * Injectable for testing environments where the Clipboard API is unavailable.
   */
  clipboardWriter?: (text: string) => Promise<void>;
}

const COPY_FEEDBACK_MS = 2000;

export function EmailForwardingSettings({
  forwardingAddress,
  accountEmail,
  clipboardWriter = (text) => navigator.clipboard.writeText(text),
}: EmailForwardingSettingsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await clipboardWriter(forwardingAddress);
      setCopied(true);
    } catch {
      // Clipboard API unavailable — fall back to selection
      const el = document.getElementById('forwarding-address-value');
      if (el) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, [forwardingAddress]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section
      className="email-forwarding-settings"
      aria-labelledby="email-forwarding-heading"
      data-testid="email-forwarding-settings"
    >
      <h2 id="email-forwarding-heading" className="email-forwarding-settings__heading">
        Email Forwarding
      </h2>

      <p className="email-forwarding-settings__instructions">
        Forward any email to the address below to create a task. Only emails
        sent <strong>from your registered address</strong> (
        <span data-testid="account-email">{accountEmail}</span>) are accepted.
      </p>

      <div className="email-forwarding-settings__address-row">
        <code
          id="forwarding-address-value"
          className="email-forwarding-settings__address"
          data-testid="forwarding-address"
          aria-label="Your email forwarding address"
        >
          {forwardingAddress}
        </code>

        <button
          type="button"
          className="email-forwarding-settings__copy-btn"
          aria-label={copied ? 'Address copied' : 'Copy forwarding address'}
          data-testid="copy-address-btn"
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </section>
  );
}
