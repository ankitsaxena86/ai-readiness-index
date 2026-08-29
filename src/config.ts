/** Bridges VS Code settings (`ari.*`) into plain engine options. */

import * as vscode from 'vscode';
import type { RawWeights } from './engine/types';
import type { ScanOptions } from './engine/scanner';

export interface AriConfig {
  weights: RawWeights;
  remediationThreshold: number;
  exclude: string[];
  maxFiles: number;
  scanOnStartup: boolean;
  rescanOnConfigChange: boolean;
  showStatusBarItem: boolean;
}

/** Settings that change the *result* of a scan (as opposed to pure UI toggles). */
export const SCAN_AFFECTING_KEYS = [
  'ari.weights',
  'ari.remediationThreshold',
  'ari.exclude',
  'ari.maxFiles',
] as const;

const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.vscode-test/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/.venv/**',
  '**/__pycache__/**',
  '**/vendor/**',
  '**/target/**',
  '**/*.asar.unpacked/**',
  '**/test/fixtures/**',
  '**/tests/fixtures/**',
  '**/__fixtures__/**',
];

export function readConfig(): AriConfig {
  const c = vscode.workspace.getConfiguration('ari');
  const exclude = c.get<string[]>('exclude', DEFAULT_EXCLUDE);
  return {
    weights: {
      context: c.get<number>('weights.context', 25),
      verifiability: c.get<number>('weights.verifiability', 20),
      reproducibility: c.get<number>('weights.reproducibility', 15),
      documentation: c.get<number>('weights.documentation', 15),
      navigability: c.get<number>('weights.navigability', 15),
      changeSafety: c.get<number>('weights.changeSafety', 10),
    },
    remediationThreshold: clamp(c.get<number>('remediationThreshold', 70), 0, 100),
    // `.git` is always excluded, even if the user cleared the list.
    exclude: dedupe([...(Array.isArray(exclude) ? exclude : DEFAULT_EXCLUDE), '**/.git/**']),
    maxFiles: Math.max(100, c.get<number>('maxFiles', 20000)),
    scanOnStartup: c.get<boolean>('scanOnStartup', true),
    rescanOnConfigChange: c.get<boolean>('rescanOnConfigChange', true),
    showStatusBarItem: c.get<boolean>('showStatusBarItem', true),
  };
}

export function toScanOptions(repoPath: string, config: AriConfig): ScanOptions {
  return {
    repoPath,
    weights: config.weights,
    exclude: config.exclude,
    remediationThreshold: config.remediationThreshold,
    maxFiles: config.maxFiles,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) {
    return hi;
  }
  return Math.min(hi, Math.max(lo, n));
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs.filter((x) => typeof x === 'string' && x.trim() !== ''))];
}
