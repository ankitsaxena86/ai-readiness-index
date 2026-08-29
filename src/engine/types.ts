/**
 * Core type contracts for the AI-Readiness Index scoring engine.
 *
 * The engine is deliberately free of any `vscode` import so it can be unit
 * tested in plain Node (vitest) and, later, reused outside the extension.
 */

/** The six scoring dimensions. Keys are stable identifiers used in settings. */
export type DimensionId =
  | 'context'
  | 'verifiability'
  | 'reproducibility'
  | 'documentation'
  | 'navigability'
  | 'changeSafety';

export const DIMENSION_IDS: readonly DimensionId[] = [
  'context',
  'verifiability',
  'reproducibility',
  'documentation',
  'navigability',
  'changeSafety',
] as const;

export const DIMENSION_LABELS: Record<DimensionId, string> = {
  context: 'Context',
  verifiability: 'Verifiability',
  reproducibility: 'Reproducibility',
  documentation: 'Documentation',
  navigability: 'Navigability',
  changeSafety: 'Change safety',
};

/**
 * A single observation a scorer made about the repo. Signals are the raw
 * material for both the score and the remediation matrix, and they make a
 * dimension's result explainable rather than a black-box number.
 */
export interface Signal {
  /** Stable id, e.g. `readme.present`, `tests.ratio`. */
  id: string;
  /** Human-readable one-liner describing what was found. */
  label: string;
  /** Did this signal contribute positively (`met`) or is it a gap (`missing`)? */
  status: 'met' | 'partial' | 'missing';
  /** Optional detail: counts, paths, percentages. */
  detail?: string;
  /** How many points (0-100 scale, pre-weight) this signal is worth. */
  weight: number;
  /** Points actually earned for this signal (0..weight). */
  earned: number;
}

/** A concrete, dimension-specific remediation action. */
export interface RemediationItem {
  dimension: DimensionId;
  /** Short imperative title, e.g. "Add a lockfile". */
  title: string;
  /** Specific guidance referencing what was actually found (or not). */
  detail: string;
  /** Rough triage bucket derived from how far below threshold the signal is. */
  priority: 'high' | 'medium' | 'low';
}

/** The result of running one dimension scorer. */
export interface DimensionResult {
  dimension: DimensionId;
  /** 0-100, before the dimension weight is applied. */
  score: number;
  /** One-sentence plain-language summary of the score. */
  summary: string;
  signals: Signal[];
  remediation: RemediationItem[];
}

/** Everything a scorer is given. Kept minimal and serializable. */
export interface ScanContext {
  /** Absolute path to the repository root. */
  repoPath: string;
  /** Glob patterns to ignore (already normalized). */
  exclude: string[];
  /** Per-dimension score below which remediation items are emitted. */
  remediationThreshold: number;
  /** Pre-built, cached view of the repo file tree (see fsUtils). */
  tree: RepoTree;
}

/** The common interface every dimension scorer implements. */
export interface DimensionScorer {
  readonly id: DimensionId;
  score(ctx: ScanContext): Promise<DimensionResult> | DimensionResult;
}

/** Normalized weights: each value is a fraction in [0,1], summing to 1. */
export type NormalizedWeights = Record<DimensionId, number>;

/** Raw (unnormalized) weights as they come from settings. */
export type RawWeights = Record<DimensionId, number>;

/** The full output of a scan. */
export interface ScanResult {
  repoPath: string;
  /** ISO timestamp. */
  scannedAt: string;
  /** 0-100 weighted overall score. */
  overall: number;
  /** Letter grade derived from `overall`. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  weights: NormalizedWeights;
  dimensions: DimensionResult[];
  /** Flattened, priority-sorted remediation across all dimensions. */
  remediation: RemediationItem[];
  /** Non-fatal problems encountered during the scan. */
  warnings: string[];
}

/**
 * A lightweight, in-memory snapshot of the repository's files, built once per
 * scan so individual scorers don't each walk the filesystem.
 */
export interface RepoTree {
  root: string;
  /** All files, repo-root-relative, POSIX separators, excludes already applied. */
  files: string[];
  /** All directories, repo-root-relative, POSIX separators. */
  dirs: string[];
  /** file path -> size in bytes. */
  sizes: Map<string, number>;
}
