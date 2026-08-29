import { describe, expect, it } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { scanRepository } from './scanner';
import { normalizeWeights, combineScore, gradeFor } from './weights';
import { DIMENSION_IDS } from './types';

describe('weights', () => {
  it('normalizes arbitrary weights to fractions summing to 1', () => {
    const w = normalizeWeights({ context: 25, verifiability: 20, reproducibility: 15, documentation: 15, navigability: 15, changeSafety: 10 });
    const sum = DIMENSION_IDS.reduce((a, id) => a + w[id], 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(w.context).toBeGreaterThan(w.changeSafety);
  });

  it('falls back to equal weighting when all weights are zero', () => {
    const w = normalizeWeights({ context: 0, verifiability: 0, reproducibility: 0, documentation: 0, navigability: 0, changeSafety: 0 });
    expect(w.context).toBeCloseTo(1 / 6, 10);
  });

  it('combineScore is a weighted mean', () => {
    const w = normalizeWeights(undefined);
    const dims = DIMENSION_IDS.map((d) => ({ dimension: d, score: 50, summary: '', signals: [], remediation: [] }));
    expect(combineScore(dims, w)).toBe(50);
  });

  it('gradeFor maps score bands', () => {
    expect(gradeFor(95)).toBe('A');
    expect(gradeFor(80)).toBe('B');
    expect(gradeFor(65)).toBe('C');
    expect(gradeFor(45)).toBe('D');
    expect(gradeFor(10)).toBe('F');
  });
});

describe('scanRepository (scaffold)', () => {
  it('produces a well-formed result over an empty temp dir', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ari-smoke-'));
    try {
      const result = await scanRepository({ repoPath: dir });
      expect(result.dimensions).toHaveLength(6);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
      expect(result.grade).toMatch(/[A-F]/);
      expect(result.warnings.some((w) => w.includes('No files'))).toBe(true);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
