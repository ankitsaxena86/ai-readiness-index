import { describe, expect, it } from 'vitest';
import { parseWidget } from '../src/parse/parseWidget';

describe('parseWidget', () => {
  it('extracts known keys', () => {
    const raw = parseWidget('{"kind":"button","label":"Save"}');
    expect(raw.kind).toBe('button');
    expect(raw.label).toBe('Save');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseWidget('{not json')).toThrow();
  });
});
