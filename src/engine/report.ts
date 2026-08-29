/**
 * Render a {@link ScanResult} as text. Pure — shared by the webview's
 * "Copy as Markdown" action and the `@ari` chat participant.
 */

import { DIMENSION_LABELS } from './types';
import type { DimensionResult, ScanResult, Signal } from './types';

const STATUS_MARK: Record<Signal['status'], string> = {
  met: '✅',
  partial: '🟡',
  missing: '❌',
};

const PRIORITY_MARK: Record<'high' | 'medium' | 'low', string> = {
  high: '🔴 high',
  medium: '🟠 medium',
  low: '⚪ low',
};

/** One-line summary, e.g. `AI-Readiness: 72/100 (B) — weakest: Documentation (54)`. */
export function toSummaryLine(result: ScanResult): string {
  const weakest = [...result.dimensions].sort((a, b) => a.score - b.score)[0];
  const weak = weakest
    ? ` — weakest: ${DIMENSION_LABELS[weakest.dimension]} (${weakest.score})`
    : '';
  return `AI-Readiness: ${result.overall}/100 (${result.grade})${weak}`;
}

export interface MarkdownOptions {
  /** Include the per-signal breakdown under each dimension. Default true. */
  includeSignals?: boolean;
  /** Include the remediation matrix. Default true. */
  includeRemediation?: boolean;
  /** Heading level to start at. Default 1. */
  baseHeading?: number;
}

export function toMarkdown(result: ScanResult, opts: MarkdownOptions = {}): string {
  const { includeSignals = true, includeRemediation = true, baseHeading = 1 } = opts;
  const h = (level: number) => '#'.repeat(Math.min(6, baseHeading + level - 1)) + ' ';
  const out: string[] = [];

  out.push(`${h(1)}AI-Readiness Index — ${result.overall}/100 (Grade ${result.grade})`);
  out.push('');
  out.push(`_Scanned ${result.repoPath} at ${new Date(result.scannedAt).toLocaleString()}_`);
  out.push('');

  if (result.warnings.length) {
    out.push(...result.warnings.map((w) => `> ⚠️ ${w}`));
    out.push('');
  }

  out.push(`${h(2)}Dimension breakdown`);
  out.push('');
  out.push('| Dimension | Weight | Score | Summary |');
  out.push('|---|---:|---:|---|');
  for (const d of result.dimensions) {
    const w = Math.round((result.weights[d.dimension] ?? 0) * 100);
    out.push(`| ${DIMENSION_LABELS[d.dimension]} | ${w}% | ${d.score} | ${d.summary} |`);
  }
  out.push('');

  if (includeSignals) {
    for (const d of result.dimensions) {
      out.push(`${h(3)}${DIMENSION_LABELS[d.dimension]} — ${d.score}/100`);
      out.push('');
      for (const s of d.signals) {
        out.push(
          `- ${STATUS_MARK[s.status]} **${s.label}** (${round(s.earned)}/${s.weight})` +
            (s.detail ? ` — ${s.detail}` : ''),
        );
      }
      out.push('');
    }
  }

  if (includeRemediation) {
    out.push(`${h(2)}Remediation matrix`);
    out.push('');
    if (result.remediation.length === 0) {
      out.push('_Every dimension cleared the remediation threshold._');
    } else {
      for (const r of result.remediation) {
        out.push(`- [ ] **${r.title}** (${PRIORITY_MARK[r.priority]}, ${DIMENSION_LABELS[r.dimension]})`);
        out.push(`  ${r.detail}`);
      }
    }
    out.push('');
  }

  return out.join('\n');
}

/** Compact markdown for one dimension — used by `@ari /explain <dimension>`. */
export function dimensionToMarkdown(d: DimensionResult, weightPct: number): string {
  const out: string[] = [];
  out.push(`### ${DIMENSION_LABELS[d.dimension]} — ${d.score}/100 (weight ${weightPct}%)`);
  out.push('');
  out.push(d.summary);
  out.push('');
  for (const s of d.signals) {
    out.push(
      `- ${STATUS_MARK[s.status]} **${s.label}** (${round(s.earned)}/${s.weight})` +
        (s.detail ? ` — ${s.detail}` : ''),
    );
  }
  if (d.remediation.length) {
    out.push('');
    out.push('**Suggested fixes:**');
    for (const r of d.remediation) {
      out.push(`- ${r.title} — ${r.detail}`);
    }
  }
  return out.join('\n');
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
