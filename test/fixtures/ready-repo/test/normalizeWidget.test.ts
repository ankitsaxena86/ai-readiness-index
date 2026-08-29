import { describe, expect, it } from 'vitest';
import { normalizeWidget } from '../src/normalize/normalizeWidget';
import type { Widget } from '../src/types';

const leaf = (label: string, theme: 'light' | 'dark' = 'light'): Widget => ({
  kind: 'button',
  label,
  theme,
  children: [],
});

describe('normalizeWidget', () => {
  it('sorts children by label', () => {
    const parent: Widget = { ...leaf('root'), children: [leaf('b'), leaf('a')] };
    expect(normalizeWidget(parent).children.map((c) => c.label)).toEqual(['a', 'b']);
  });

  it('propagates the parent theme to children', () => {
    const parent: Widget = { ...leaf('root', 'dark'), children: [leaf('child')] };
    expect(normalizeWidget(parent).children[0].theme).toBe('dark');
  });
});
