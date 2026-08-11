import DOMPurify from 'isomorphic-dompurify';

// Tenant templates are stored HTML. Use a parser-based allowlist: regular
// expressions cannot safely model malformed/nested HTML or browser parsing.
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [
      'p', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'blockquote',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a',
    ],
    ALLOWED_ATTR: ['class', 'dir', 'lang', 'href', 'title', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'svg', 'math', 'template'],
    FORBID_ATTR: ['style', 'src', 'srcset'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
