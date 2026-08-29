import type { RawWidget } from '../types';

/**
 * Parse a JSON string into a {@link RawWidget}. This stage does no validation —
 * it only guarantees the result is an object with the expected keys present.
 */
export function parseWidget(json: string): RawWidget {
  // A malformed JSON string is a caller error, so we let JSON.parse throw here.
  const value = JSON.parse(json) as Record<string, unknown>;

  return {
    kind: value.kind,
    label: value.label,
    theme: value.theme,
    // Children are parsed shallowly; the validator recurses.
    children: value.children,
  };
}
