import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRepoTree } from '../fsUtils';
import type { ScanContext } from '../types';
import { documentationScorer } from './documentation';

const FIXTURES = path.resolve(__dirname, '../../../test/fixtures');

async function scoreFixture(name: string, threshold = 70) {
  const repoPath = path.join(FIXTURES, name);
  const tree = await buildRepoTree(repoPath, {
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  });
  const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: threshold, tree };
  return documentationScorer.score(ctx);
}

describe('documentationScorer', () => {
  it('rates the ready fixture highly', async () => {
    const r = await scoreFixture('ready-repo');
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.remediation).toHaveLength(0);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['doc.contributing'].status).toBe('met');
    expect(byId['doc.directory'].status).toBe('met');
    expect(byId['doc.adr'].status).toBe('met');
    expect(byId['doc.api'].status).toBe('met');
    expect(byId['doc.comments'].status).not.toBe('missing');
    expect(byId['doc.supporting'].status).not.toBe('missing');
  });

  it('rates the not-ready fixture poorly with specific fixes', async () => {
    const r = await scoreFixture('not-ready-repo');
    expect(r.score).toBeLessThanOrEqual(25);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['doc.contributing'].status).toBe('missing');
    expect(byId['doc.directory'].status).toBe('missing');
    expect(byId['doc.adr'].status).toBe('missing');

    const titles = r.remediation.map((x) => x.title.toLowerCase());
    expect(titles.some((t) => t.includes('contributing'))).toBe(true);
    expect(titles.some((t) => t.includes('docs/'))).toBe(true);
    expect(titles.some((t) => t.includes('public functions'))).toBe(true);
  });

  it('gives partial credit for contribution info that lives only in the README', async () => {
    // ready-repo has a real CONTRIBUTING.md; assert the partial path via a synthetic tree
    const repoPath = path.join(FIXTURES, 'ready-repo');
    const tree = await buildRepoTree(repoPath, { exclude: ['**/CONTRIBUTING.md', '**/docs/**'] });
    const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: 70, tree };
    const r = await documentationScorer.score(ctx);
    expect(r.signals.find((s) => s.id === 'doc.contributing')?.status).toBe('partial');
  });
});
