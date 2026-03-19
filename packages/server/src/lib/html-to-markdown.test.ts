import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, stripHtml } from './html-to-markdown.js';

describe('htmlToMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('   ')).toBe('');
  });

  it('converts <strong> to **bold**', () => {
    expect(htmlToMarkdown('<strong>hello</strong>')).toBe('**hello**');
  });

  it('converts <em> to _italic_', () => {
    expect(htmlToMarkdown('<em>world</em>')).toBe('_world_');
  });

  it('converts <a href> to [text](url)', () => {
    const result = htmlToMarkdown('<a href="https://example.com">Click here</a>');
    expect(result).toBe('[Click here](https://example.com)');
  });

  it('strips javascript: hrefs from links', () => {
    const result = htmlToMarkdown('<a href="javascript:alert(1)">bad</a>');
    expect(result).not.toContain('javascript:');
  });

  it('converts <ul><li> to markdown list', () => {
    const result = htmlToMarkdown('<ul><li>Item one</li><li>Item two</li></ul>');
    // Turndown uses '-   ' (dash + 3 spaces) for list items
    expect(result).toMatch(/^-\s+Item one/m);
    expect(result).toMatch(/^-\s+Item two/m);
  });

  it('strips <script> tags completely', () => {
    const result = htmlToMarkdown('<p>Safe</p><script>alert("xss")</script>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
    expect(result).toContain('Safe');
  });

  it('strips <style> tags completely', () => {
    const result = htmlToMarkdown('<style>body{color:red}</style><p>text</p>');
    expect(result).not.toContain('color');
    expect(result).toContain('text');
  });

  it('strips <img> tags', () => {
    const result = htmlToMarkdown('<p>text</p><img src="http://x.com/img.png" />');
    expect(result).not.toContain('img');
    expect(result).not.toContain('src');
  });

  it('handles plain text passthrough', () => {
    expect(htmlToMarkdown('Hello world')).toBe('Hello world');
  });

  it('handles complex real-world email body', () => {
    const html = `
      <html><body>
        <p>Hi there,</p>
        <p>Please <strong>follow up</strong> with the <a href="https://example.com">design team</a>.</p>
        <ul>
          <li>Review mockups</li>
          <li>Send feedback</li>
        </ul>
        <script>document.cookie = 'stolen';</script>
      </body></html>
    `;
    const result = htmlToMarkdown(html);
    expect(result).toContain('**follow up**');
    expect(result).toContain('[design team](https://example.com)');
    expect(result).toMatch(/^-\s+Review mockups/m);
    expect(result).not.toContain('script');
    expect(result).not.toContain('document.cookie');
  });
});

describe('stripHtml', () => {
  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('removes all HTML tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('strips script tags and their content', () => {
    const result = stripHtml('<p>ok</p><script>evil()</script>');
    expect(result).not.toContain('evil');
    expect(result).toContain('ok');
  });
});
