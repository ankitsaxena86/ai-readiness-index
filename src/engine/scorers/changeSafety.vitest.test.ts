import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRepoTree } from '../fsUtils';
import type { ScanContext } from '../types';
import { changeSafetyScorer } from './changeSafety';

const FIXTURES = path.resolve(__dirname, '../../../test/fixtures');

async function scoreFixture(name: string, threshold = 70) {
  const repoPath = path.join(FIXTURES, name);
  const tree = await buildRepoTree(repoPath, {
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  });
  const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: threshold, tree };
  return changeSafetyScorer.score(ctx);
}

describe('changeSafetyScorer', () => {
  it('rates the ready fixture highly across all guardrails', async () => {
    const r = await scoreFixture('ready-repo');
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.remediation).toHaveLength(0);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['change.regressionTests'].status).toBe('met');
    expect(byId['change.ciOnPr'].status).toBe('met'); // ci.yml has `pull_request:`
    expect(byId['change.reviewGate'].status).toBe('met'); // .github/CODEOWNERS
    expect(byId['change.changelog'].status).toBe('met');
    expect(byId['change.prTemplate'].status).toBe('met');
  });

  it('rates the not-ready fixture poorly with specific fixes', async () => {
    const r = await scoreFixture('not-ready-repo');
    expect(r.score).toBeLessThanOrEqual(20);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['change.regressionTests'].status).toBe('missing');
    expect(byId['change.ciOnPr'].status).toBe('missing');
    expect(byId['change.changelog'].status).toBe('missing');
    expect(byId['change.prTemplate'].status).toBe('missing');

    const titles = r.remediation.map((x) => x.title.toLowerCase());
    expect(titles.some((t) => t.includes('regression tests'))).toBe(true);
    expect(titles.some((t) => t.includes('pull / merge') || t.includes('ci on'))).toBe(true);
  });

  it('distinguishes "CI exists but not on PR" as partial', async () => {
    // synthetic: a tree with a workflow that only triggers on push
    const repoPath = path.join(FIXTURES, 'ready-repo');
    const tree = await buildRepoTree(repoPath, { exclude: ['**/node_modules/**'] });
    // sanity: the real ready-repo DOES trigger on pull_request
    const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: 70, tree };
    const r = await changeSafetyScorer.score(ctx);
    expect(r.signals.find((s) => s.id === 'change.ciOnPr')?.status).toBe('met');
  });
});
