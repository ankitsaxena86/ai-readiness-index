import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRepoTree } from '../fsUtils';
import type { ScanContext } from '../types';
import { navigabilityScorer } from './navigability';

const FIXTURES = path.resolve(__dirname, '../../../test/fixtures');

async function scoreFixture(name: string, threshold = 70) {
  const repoPath = path.join(FIXTURES, name);
  const tree = await buildRepoTree(repoPath, {
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  });
  const ctx: ScanContext = { repoPath, exclude: [], remediationThreshold: threshold, tree };
  return navigabilityScorer.score(ctx);
}

describe('navigabilityScorer', () => {
  it('rates the ready fixture highly', async () => {
    const r = await scoreFixture('ready-repo');
    expect(r.score).toBeGreaterThanOrEqual(75);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['structure.sourceRoot'].status).toBe('met');
    expect(byId['structure.entrypoint'].status).toBe('met');
    expect(byId['structure.depth'].status).toBe('met');
  });

  it('rates the flat not-ready fixture poorly', async () => {
    const r = await scoreFixture('not-ready-repo');
    expect(r.score).toBeLessThanOrEqual(55);

    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId['structure.sourceRoot'].status).toBe('missing');
    expect(byId['structure.cohesion'].status).toBe('missing');

    const titles = r.remediation.map((x) => x.title.toLowerCase());
    expect(titles.some((t) => t.includes('dedicated root'))).toBe(true);
    expect(titles.some((t) => t.includes('group modules'))).toBe(true);
  });

  it('detects a consistent naming convention in the ready fixture', async () => {
    const r = await scoreFixture('ready-repo');
    const naming = r.signals.find((s) => s.id === 'naming.consistency');
    // ready-repo uses camelCase module files (parseWidget.ts, validateWidget.ts, ...)
    expect(naming?.status).not.toBe('missing');
  });
});
