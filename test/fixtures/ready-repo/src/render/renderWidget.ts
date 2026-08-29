import type { Widget } from '../types';

/** Escape the small set of characters that matter inside element text. */
function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

/**
 * Render a normalized {@link Widget} to an HTML string. Pure and total — any
 * valid widget renders, and it never throws.
 */
export function renderWidget(widget: Widget): string {
  const inner = widget.children.map(renderWidget).join('');
  const themeAttr = ` data-theme="${widget.theme}"`;

  switch (widget.kind) {
    case 'button':
      return `<button${themeAttr}>${escapeText(widget.label)}${inner}</button>`;
    case 'checkbox':
      return `<label${themeAttr}><input type="checkbox" /> ${escapeText(widget.label)}</label>${inner}`;
    case 'divider':
      return `<hr${themeAttr} />`;
  }
}
