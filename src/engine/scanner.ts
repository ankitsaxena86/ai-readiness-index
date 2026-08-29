/**
 * Scan orchestrator: builds the repo tree once, runs every dimension scorer,
 * applies weights, and assembles the {@link ScanResult} including the flattened
 * remediation matrix.
 *
 * No `vscode` import — the extension layer passes plain options in.
 */

import { buildRepoTree } from './fsUtils';
import { SCORERS } from './scorers';
import {
  combineScore,
  gradeFor,
  normalizeWeights,
  PRIORITY_RANK,
} from './weights';
import type {
  DimensionResult,
  RawWeights,
  RemediationItem,
  ScanContext,
  ScanResult,
} from './types';

export interface ScanOptions {
  repoPath: string;
  weights?: Partial<RawWeights>;
  exclude?: string[];
  remediationThreshold?: number;
  maxFiles?: number;
}

const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/.vscode-test/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/*.asar.unpacked/**',
  '**/test/fixtures/**',
  '**/tests/fixtures/**',
  '**/__fixtures__/**',
];

export async function scanRepository(options: ScanOptions): Promise<ScanResult> {
  const warnings: string[] = [];
  const exclude = options.exclude?.length ? options.exclude : DEFAULT_EXCLUDES;
  const remediationThreshold = options.remediationThreshold ?? 70;
  const weights = normalizeWeights(options.weights);

  const tree = await buildRepoTree(options.repoPath, {
    exclude,
    maxFiles: options.maxFiles,
  });
  if (tree.files.length === 0) {
    warnings.push('No files found to scan (check exclude patterns or folder path).');
  }

  const ctx: ScanContext = {
    repoPath: options.repoPath,
    exclude,
    remediationThreshold,
    tree,
  };

  const dimensions: DimensionResult[] = [];
  for (const scorer of SCORERS) {
    try {
      const result = await scorer.score(ctx);
      dimensions.push(clampResult(result));
    } catch (err) {
      warnings.push(
        `Dimension "${scorer.id}" failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      dimensions.push({
        dimension: scorer.id,
        score: 0,
        summary: 'Scorer errored; treated as 0.',
        signals: [],
        remediation: [],
      });
    }
  }

  const overall = combineScore(dimensions, weights);
  const remediation = flattenRemediation(dimensions);

  return {
    repoPath: options.repoPath,
    scannedAt: new Date().toISOString(),
    overall,
    grade: gradeFor(overall),
    weights,
    dimensions,
    remediation,
    warnings,
  };
}

function clampResult(r: DimensionResult): DimensionResult {
  const score = Math.max(0, Math.min(100, Math.round(r.score)));
  return { ...r, score };
}

function flattenRemediation(dimensions: DimensionResult[]): RemediationItem[] {
  const all = dimensions.flatMap((d) => d.remediation);
  return all.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}
