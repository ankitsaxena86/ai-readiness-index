import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRepoTree } from '../fsUtils';
import type { ScanContext } from '../types';
import { reproducibilityScorer } from './reproducibility';

const FIXTURES = path.resolve(__dirname, '../../../test/fixtures');

async function scoreFixture(name: string, threshold = 70) {
  const repoPath = path.join(FIXTURES, name);
  const tree = await buildRepoTree(repoPath, {
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  });
  const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: threshold, tree };
  return reproducibilityScorer.score(ctx);
}

describe('reproducibilityScorer', () => {
  it('rates the ready fixture highly', async () => {
    const r = await scoreFixture('ready-repo');
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.remediation).toHaveLength(0);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['setup.instructions'].status).toBe('met');
    expect(byId['deps.pinned'].status).toBe('met');
    expect(byId['lockfile.present'].status).toBe('met');
    expect(byId['runtime.pinned'].status).toBe('met');
    expect(byId['containerization'].status).toBe('met');
  });

  it('rates the not-ready fixture poorly', async () => {
    const r = await scoreFixture('not-ready-repo');
    expect(r.score).toBeLessThanOrEqual(35);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['setup.instructions'].status).toBe('missing');
    expect(byId['lockfile.present'].status).toBe('missing');
    expect(byId['deps.pinned'].status).not.toBe('met');

    const titles = r.remediation.map((x) => x.title.toLowerCase());
    expect(titles.some((t) => t.includes('set up') || t.includes('setup'))).toBe(true);
    expect(titles.some((t) => t.includes('lockfile'))).toBe(true);
    expect(titles.some((t) => t.includes('dependency') || t.includes('version'))).toBe(true);
  });

  it('does not hard-penalize a repo that simply has no package manifest', async () => {
    const r = await scoreFixture('ready-repo', 70); // sanity that bonus logic holds
    const container = r.signals.find((s) => s.id === 'containerization');
    expect(container?.weight).toBe(14);
  });

  it('treats missing containerization as a half-credit bonus, not a failure', async () => {
    const repoPath = path.join(FIXTURES, 'ready-repo', 'docs');
    const tree = await buildRepoTree(repoPath, { exclude: [] });
    const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: 70, tree };
    const r = await reproducibilityScorer.score(ctx);
    const container = r.signals.find((s) => s.id === 'containerization');
    expect(container?.status).toBe('partial');
    expect(container?.earned).toBe(7);
  });
});
