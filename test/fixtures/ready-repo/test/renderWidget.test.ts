import { describe, expect, it } from 'vitest';
import { renderWidget } from '../src/render/renderWidget';
import { normalizeWidget } from '../src/normalize/normalizeWidget';
import { validateWidget } from '../src/validate/validateWidget';

function compile(spec: unknown): string {
  const v = validateWidget(spec as never);
  if (Array.isArray(v)) {
    throw new Error('invalid');
  }
  return renderWidget(normalizeWidget(v));
}

describe('renderWidget', () => {
  it('renders a button', () => {
    expect(compile({ kind: 'button', label: 'Save' })).toBe('<button data-theme="light">Save</button>');
  });

  it('escapes label text', () => {
    expect(compile({ kind: 'button', label: '<x>' })).toContain('&lt;x&gt;');
  });

  it('renders a divider as a self-closing hr', () => {
    expect(compile({ kind: 'divider' })).toBe('<hr data-theme="light" />');
  });
});
