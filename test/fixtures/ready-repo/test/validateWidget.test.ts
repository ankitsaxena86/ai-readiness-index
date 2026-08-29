import { describe, expect, it } from 'vitest';
import { validateWidget } from '../src/validate/validateWidget';

describe('validateWidget', () => {
  it('accepts a valid button', () => {
    const result = validateWidget({ kind: 'button', label: 'Save' });
    expect(Array.isArray(result)).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const result = validateWidget({ kind: 'slider', label: 'x' });
    expect(result).toEqual([{ path: '$.kind', message: expect.any(String) }]);
  });

  it('requires a label on non-divider kinds', () => {
    const result = validateWidget({ kind: 'button' });
    expect(Array.isArray(result) && result[0].path).toBe('$.label');
  });

  it('allows a divider without a label', () => {
    expect(Array.isArray(validateWidget({ kind: 'divider' }))).toBe(false);
  });
});
