import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanRepository } from '../engine/scanner';
import { renderResultsHtml } from './resultsHtml';

const FIXTURES = path.resolve(__dirname, '../../test/fixtures');

describe('renderResultsHtml', () => {
  it('renders a well-formed, self-contained document with a CSP and matching nonce', async () => {
    const result = await scanRepository({ repoPath: path.join(FIXTURES, 'not-ready-repo') });
    const html = renderResultsHtml(result, 'TESTNONCE');

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("script-src 'nonce-TESTNONCE'");
    expect(html).toContain('<style nonce="TESTNONCE">');
    expect(html).toContain('<script nonce="TESTNONCE">');
    // no external resources
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:/);
    // balanced-ish details blocks: one per dimension
    expect((html.match(/<details class="dim"/g) ?? []).length).toBe(6);
  });

  it('shows the score, grade and every remediation title', async () => {
    const result = await scanRepository({ repoPath: path.join(FIXTURES, 'not-ready-repo') });
    const html = renderResultsHtml(result);
    expect(html).toContain(`>${result.overall}<small>/100</small>`);
    expect(html).toContain(`data-g="${result.grade}"`);
    for (const item of result.remediation) {
      expect(html).toContain(item.title.replace(/&/g, '&amp;'));
    }
  });

  it('escapes HTML metacharacters coming from scan detail strings', async () => {
    const result = await scanRepository({ repoPath: path.join(FIXTURES, 'ready-repo') });
    const html = renderResultsHtml(result);
    // A detail like `<button>Save</button>` must never appear unescaped.
    expect(html).not.toMatch(/<script>(?!.*nonce)/);
    expect(html).not.toContain('<button>Save</button>');
  });

  it('shows the celebratory empty state when there is no remediation', async () => {
    const result = await scanRepository({ repoPath: path.join(FIXTURES, 'ready-repo') });
    if (result.remediation.length === 0) {
      expect(renderResultsHtml(result)).toContain('nothing to fix');
    }
  });
});
