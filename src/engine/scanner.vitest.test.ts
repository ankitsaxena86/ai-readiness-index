import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanRepository } from './scanner';
import { DIMENSION_IDS } from './types';

const FIXTURES = path.resolve(__dirname, '../../test/fixtures');

describe('scanRepository (all six dimensions wired)', () => {
  it('scores the ready fixture in the A/B range', async () => {
    const r = await scanRepository({ repoPath: path.join(FIXTURES, 'ready-repo') });
    expect(r.overall).toBeGreaterThanOrEqual(85);
    expect(['A', 'B']).toContain(r.grade);
    expect(r.dimensions).toHaveLength(6);
    expect(r.dimensions.every((d) => d.summary && d.summary !== 'Scorer not yet implemented.')).toBe(true);
    expect(r.remediation.length).toBeLessThanOrEqual(3);
    expect(r.warnings).toHaveLength(0);
  });

  it('scores the not-ready fixture as F with a full remediation matrix', async () => {
    const r = await scanRepository({ repoPath: path.join(FIXTURES, 'not-ready-repo') });
    expect(r.overall).toBeLessThanOrEqual(25);
    expect(r.grade).toBe('F');
    expect(r.remediation.length).toBeGreaterThanOrEqual(6);
    // sorted by priority, highest first
    const ranks = r.remediation.map((x) => ({ high: 0, medium: 1, low: 2 })[x.priority]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // every dimension represented in the matrix
    expect(new Set(r.remediation.map((x) => x.dimension)).size).toBe(6);
  });

  it('respects custom weights', async () => {
    const base = await scanRepository({ repoPath: path.join(FIXTURES, 'not-ready-repo') });
    // Zero every weight except changeSafety -> overall should equal that dimension's score.
    const skewed = await scanRepository({
      repoPath: path.join(FIXTURES, 'not-ready-repo'),
      weights: {
        context: 0,
        verifiability: 0,
        reproducibility: 0,
        documentation: 0,
        navigability: 0,
        changeSafety: 1,
      },
    });
    const cs = skewed.dimensions.find((d) => d.dimension === 'changeSafety')!;
    expect(skewed.overall).toBe(cs.score);
    expect(skewed.overall).not.toBe(base.overall);
  });

  it('normalizes weights so only ratios matter', async () => {
    const a = await scanRepository({
      repoPath: path.join(FIXTURES, 'ready-repo'),
      weights: { context: 1, verifiability: 1, reproducibility: 1, documentation: 1, navigability: 1, changeSafety: 1 },
    });
    const b = await scanRepository({
      repoPath: path.join(FIXTURES, 'ready-repo'),
      weights: { context: 50, verifiability: 50, reproducibility: 50, documentation: 50, navigability: 50, changeSafety: 50 },
    });
    expect(a.overall).toBe(b.overall);
  });

  it('produces a result (not a throw) for a directory with no recognizable project', async () => {
    const r = await scanRepository({ repoPath: FIXTURES });
    expect(DIMENSION_IDS.every((id) => r.dimensions.some((d) => d.dimension === id))).toBe(true);
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(100);
  });
});
