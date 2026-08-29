import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRepoTree } from '../fsUtils';
import type { ScanContext } from '../types';
import { contextScorer } from './context';

const FIXTURES = path.resolve(__dirname, '../../../test/fixtures');

async function scoreFixture(name: string, threshold = 70) {
  const repoPath = path.join(FIXTURES, name);
  const tree = await buildRepoTree(repoPath, {
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  });
  const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: threshold, tree };
  return contextScorer.score(ctx);
}

describe('contextScorer', () => {
  it('rates the ready fixture highly', async () => {
    const r = await scoreFixture('ready-repo');
    expect(r.dimension).toBe('context');
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.remediation).toHaveLength(0);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['readme.present'].status).toBe('met');
    expect(byId['readme.sections'].status).toBe('met');
    expect(byId['readme.codeExamples'].status).toBe('met');
    expect(byId['architecture.docs'].status).toBe('met');
    expect(byId['types.coverage'].status).toBe('met');
  });

  it('rates the not-ready fixture poorly and explains why', async () => {
    const r = await scoreFixture('not-ready-repo');
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.remediation.length).toBeGreaterThan(0);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['readme.depth'].status).toBe('missing');
    expect(byId['architecture.docs'].status).toBe('missing');
    expect(byId['types.coverage'].status).not.toBe('met');

    // Remediation must be specific: reference the README expansion and architecture.
    const titles = r.remediation.map((x) => x.title.toLowerCase());
    expect(titles.some((t) => t.includes('readme'))).toBe(true);
    expect(titles.some((t) => t.includes('architecture'))).toBe(true);
  });

  it('emits no remediation when the dimension clears the threshold', async () => {
    const r = await scoreFixture('ready-repo', 60);
    expect(r.remediation).toHaveLength(0);
  });

  it('handles a repo with no README at all', async () => {
    // not-ready still has a README; simulate none by pointing at an empty subtree
    const repoPath = path.join(FIXTURES, 'ready-repo', 'docs', 'adr');
    const tree = await buildRepoTree(repoPath, { exclude: [] });
    const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: 70, tree };
    const r = await contextScorer.score(ctx);
    expect(r.signals.find((s) => s.id === 'readme.present')?.status).toBe('missing');
    expect(r.score).toBeLessThan(40);
  });
});
