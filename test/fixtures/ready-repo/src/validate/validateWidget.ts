import type { RawWidget, ValidationError, Widget, WidgetKind } from '../types';

const KINDS: readonly WidgetKind[] = ['button', 'checkbox', 'divider'];

/**
 * Validate a {@link RawWidget}. Returns a fully typed {@link Widget} on success,
 * or a list of {@link ValidationError} on failure. Never throws.
 */
export function validateWidget(raw: RawWidget, path = '$'): Widget | ValidationError[] {
  const errors: ValidationError[] = [];

  // `kind` must be one of the known widget kinds.
  if (typeof raw.kind !== 'string' || !KINDS.includes(raw.kind as WidgetKind)) {
    errors.push({ path: `${path}.kind`, message: `expected one of ${KINDS.join(', ')}` });
  }
  const kind = raw.kind as WidgetKind;

  // Every kind except `divider` needs a non-empty label.
  const label = raw.label;
  if (kind !== 'divider' && (typeof label !== 'string' || label.trim() === '')) {
    errors.push({ path: `${path}.label`, message: 'a non-empty label is required' });
  }

  // Theme is optional but must be valid when present.
  if (raw.theme !== undefined && raw.theme !== 'light' && raw.theme !== 'dark') {
    errors.push({ path: `${path}.theme`, message: "expected 'light' or 'dark'" });
  }

  // Recurse into children, collecting nested errors.
  const children: Widget[] = [];
  if (Array.isArray(raw.children)) {
    raw.children.forEach((child, index) => {
      const result = validateWidget(child as RawWidget, `${path}.children[${index}]`);
      if (Array.isArray(result)) {
        errors.push(...result);
      } else {
        children.push(result);
      }
    });
  }

  if (errors.length > 0) {
    return errors;
  }

  return {
    kind,
    label: typeof label === 'string' ? label : '',
    theme: raw.theme === 'dark' ? 'dark' : 'light',
    children,
  };
}
