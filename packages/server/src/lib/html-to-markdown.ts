/**
 * HTML-to-Markdown conversion for email bodies.
 *
 * Uses Turndown to convert HTML to Markdown.
 * Strips: <script>, <style>, <img>, inline event handlers.
 * Preserves: <a href> → [text](url), <ul>/<li> → - item,
 *            <strong> → **text**, <em> → _text_, line breaks.
 */
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

// Strip tags that must never appear in stored notes.
turndown.addRule('strip-dangerous', {
  filter: ['script', 'style', 'img', 'head'],
  replacement: () => '',
});

// Preserve anchor links.
turndown.addRule('links', {
  filter: 'a',
  replacement: (content, node) => {
    const href = (node as HTMLAnchorElement).getAttribute?.('href') ?? '';
    if (!href || !content.trim()) return content;
    // Only allow http(s) and mailto links; drop javascript: etc.
    if (!/^(https?:|mailto:)/i.test(href)) return content;
    return `[${content}](${href})`;
  },
});

/**
 * Converts an HTML email body to clean Markdown.
 *
 * @param html  Raw HTML string from the email body.
 * @returns     Clean Markdown string, or empty string if input is empty.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return '';
  return turndown.turndown(html).trim();
}

/**
 * Strips all HTML tags and returns plain text.
 * Used as a fallback when Turndown output is not suitable.
 */
export function stripHtml(html: string): string {
  if (!html || !html.trim()) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
