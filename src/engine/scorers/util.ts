/** Shared helpers for individual dimension scorers. */

import { scoreFromSignals } from '../weights';
import type {
  DimensionId,
  DimensionResult,
  RemediationItem,
  ScanContext,
  Signal,
} from '../types';

/** Build a signal, defaulting `earned` from `status` when not given. */
export function signal(
  partial: Omit<Signal, 'earned'> & { earned?: number },
): Signal {
  const earned =
    partial.earned ??
    (partial.status === 'met'
      ? partial.weight
      : partial.status === 'partial'
        ? partial.weight / 2
        : 0);
  return { ...partial, earned };
}

export function remediation(
  dimension: DimensionId,
  title: string,
  detail: string,
  priority: RemediationItem['priority'] = 'medium',
): RemediationItem {
  return { dimension, title, detail, priority };
}

/** Placeholder result for scorers not yet implemented during scaffolding. */
export function notImplemented(dimension: DimensionId) {
  return {
    dimension,
    score: 0,
    summary: 'Scorer not yet implemented.',
    signals: [] as Signal[],
    remediation: [] as RemediationItem[],
  };
}

/**
 * Standard assembly for a scorer: derive the 0-100 score from its signals, and
 * only emit remediation when the dimension as a whole lands below the
 * configured threshold (per the rubric — remediation is dimension-gated, not
 * signal-gated).
 */
export function finalize(
  dimension: DimensionId,
  signals: Signal[],
  ctx: ScanContext,
  summarize: (score: number, signals: Signal[]) => string,
  remediate: (weakSignals: Signal[], score: number) => RemediationItem[],
): DimensionResult {
  const score = Math.round(scoreFromSignals(signals));
  const weak = signals.filter((s) => s.status !== 'met');
  const remediation =
    score < ctx.remediationThreshold ? remediate(weak, score) : [];
  return { dimension, score, summary: summarize(score, signals), signals, remediation };
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
