/**
 * Weight normalization and score aggregation.
 *
 * Settings expose the six weights as arbitrary non-negative numbers (defaults
 * 25/20/15/15/15/10). Only their ratios matter — we normalize to fractions
 * that sum to 1 before combining dimension scores.
 */

import { DIMENSION_IDS } from './types';
import type { DimensionId, DimensionResult, NormalizedWeights, RawWeights } from './types';

/** Copilot-tuned defaults. Mirrors the `ari.weights.*` setting defaults. */
export const DEFAULT_RAW_WEIGHTS: RawWeights = {
  context: 25,
  verifiability: 20,
  reproducibility: 15,
  documentation: 15,
  navigability: 15,
  changeSafety: 10,
};

export function normalizeWeights(raw: Partial<RawWeights> | undefined): NormalizedWeights {
  const merged: RawWeights = { ...DEFAULT_RAW_WEIGHTS, ...(raw ?? {}) };
  const clamped = DIMENSION_IDS.map((id) => Math.max(0, Number(merged[id]) || 0));
  const total = clamped.reduce((a, b) => a + b, 0);

  const out = {} as NormalizedWeights;
  if (total === 0) {
    // Degenerate config: fall back to equal weighting rather than divide by zero.
    const equal = 1 / DIMENSION_IDS.length;
    for (const id of DIMENSION_IDS) {
      out[id] = equal;
    }
    return out;
  }
  DIMENSION_IDS.forEach((id, i) => {
    out[id] = clamped[i] / total;
  });
  return out;
}

/** Weighted mean of dimension scores, rounded to an integer 0-100. */
export function combineScore(
  dimensions: DimensionResult[],
  weights: NormalizedWeights,
): number {
  let acc = 0;
  for (const d of dimensions) {
    acc += clamp01to100(d.score) * (weights[d.dimension] ?? 0);
  }
  return Math.round(clamp01to100(acc));
}

export function gradeFor(overall: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (overall >= 90) {
    return 'A';
  }
  if (overall >= 75) {
    return 'B';
  }
  if (overall >= 60) {
    return 'C';
  }
  if (overall >= 40) {
    return 'D';
  }
  return 'F';
}

export function clamp01to100(n: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.min(100, Math.max(0, n));
}

/** Convenience for scorers: sum earned / sum weight, as a 0-100 score. */
export function scoreFromSignals(signals: { weight: number; earned: number }[]): number {
  const totalWeight = signals.reduce((a, s) => a + s.weight, 0);
  if (totalWeight === 0) {
    return 0;
  }
  const earned = signals.reduce((a, s) => a + s.earned, 0);
  return clamp01to100((earned / totalWeight) * 100);
}

export function priorityFor(score: number, threshold: number): 'high' | 'medium' | 'low' {
  const gap = threshold - score;
  if (gap >= 40) {
    return 'high';
  }
  if (gap >= 20) {
    return 'medium';
  }
  return 'low';
}

export const PRIORITY_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function isDimensionId(v: string): v is DimensionId {
  return (DIMENSION_IDS as readonly string[]).includes(v);
}
