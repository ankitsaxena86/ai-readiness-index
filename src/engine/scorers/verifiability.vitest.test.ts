import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRepoTree } from '../fsUtils';
import type { ScanContext } from '../types';
import { verifiabilityScorer } from './verifiability';

const FIXTURES = path.resolve(__dirname, '../../../test/fixtures');

async function scoreFixture(name: string, threshold = 70) {
  const repoPath = path.join(FIXTURES, name);
  const tree = await buildRepoTree(repoPath, {
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  });
  const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: threshold, tree };
  return verifiabilityScorer.score(ctx);
}

describe('verifiabilityScorer', () => {
  it('rates the ready fixture highly', async () => {
    const r = await scoreFixture('ready-repo');
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.remediation).toHaveLength(0);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['tests.present'].status).toBe('met');
    expect(byId['tests.ratio'].status).toBe('met');
    expect(byId['ci.config'].status).toBe('met');
    expect(byId['ci.config'].detail).toContain('GitHub Actions');
    expect(byId['lint.config'].status).toBe('met');
    expect(byId['test.script'].status).toBe('met');
  });

  it('rates the not-ready fixture poorly with actionable fixes', async () => {
    const r = await scoreFixture('not-ready-repo');
    expect(r.score).toBeLessThanOrEqual(25);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['tests.present'].status).toBe('missing');
    expect(byId['ci.config'].status).toBe('missing');
    expect(byId['lint.config'].status).toBe('missing');

    const titles = r.remediation.map((x) => x.title.toLowerCase());
    expect(titles.some((t) => t.includes('test suite'))).toBe(true);
    expect(titles.some((t) => t.includes('ci pipeline'))).toBe(true);
    expect(titles.some((t) => t.includes('linter'))).toBe(true);
    // Runner suggestion is language-aware (JS fixture -> Vitest/Jest).
    const testFix = r.remediation.find((x) => x.title.toLowerCase().includes('test suite'));
    expect(testFix?.detail).toMatch(/Vitest|Jest/);
  });

  it('does not credit the npm placeholder test script', async () => {
    const repoPath = path.join(FIXTURES, 'not-ready-repo');
    const tree = await buildRepoTree(repoPath, { exclude: [] });
    const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: 70, tree };
    const r = await verifiabilityScorer.score(ctx);
    expect(r.signals.find((s) => s.id === 'test.script')?.status).toBe('missing');
  });
});
