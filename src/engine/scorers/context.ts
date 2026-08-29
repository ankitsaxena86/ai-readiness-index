/**
 * Context — how well the repository surrounds an AI assistant with the context
 * it needs before it can help: a README with real depth, an architecture
 * narrative, inline comments, and machine-readable types.
 *
 * All checks are local filesystem heuristics.
 */

import { findRootFile, readFileSafe } from '../fsUtils';
import {
  analyzeComments,
  analyzeTypeCoverage,
  basename,
  classifyRepo,
} from '../source';
import { priorityFor } from '../weights';
import type { DimensionScorer, ScanContext, Signal } from '../types';
import { finalize, pct, remediation, signal } from './util';

const SECTION_KEYWORDS = [
  'overview',
  'introduction',
  'about',
  'features',
  'installation',
  'install',
  'setup',
  'getting started',
  'quick start',
  'usage',
  'example',
  'examples',
  'configuration',
  'architecture',
  'design',
  'api',
  'development',
  'contributing',
  'testing',
  'deployment',
  'license',
  'roadmap',
  'faq',
  'troubleshooting',
];

const ARCH_DOC_RE =
  /(^|\/)(architecture|design|adr|rfc|hld|lld)[^/]*\.(md|mdx|rst|adoc)$|(^|\/)docs\/(architecture|design)(\/|\.)|(^|\/)(docs\/)?adr\//i;

export const contextScorer: DimensionScorer = {
  id: 'context',
  async score(ctx: ScanContext) {
    const { tree } = ctx;
    const readmePath = findRootFile(tree, 'README.md', 'README.markdown', 'README.rst', 'README');
    const readme = readmePath ? await readFileSafe(tree.root, readmePath) : undefined;

    const signals: Signal[] = [];

    // --- README present ---
    signals.push(
      signal({
        id: 'readme.present',
        label: 'README at repository root',
        weight: 12,
        status: readme ? 'met' : 'missing',
        detail: readme ? readmePath : 'no README file found',
      }),
    );

    // --- README depth (length) ---
    const chars = readme ? readme.replace(/\s+/g, ' ').trim().length : 0;
    const depthRatio = clamp01(chars / 2000);
    signals.push(
      signal({
        id: 'readme.depth',
        label: 'README has substantive prose',
        weight: 24,
        status: chars >= 1200 ? 'met' : chars >= 300 ? 'partial' : 'missing',
        detail: `${chars} chars of content`,
        earned: 24 * depthRatio,
      }),
    );

    // --- README sections ---
    const headings = readme ? extractHeadings(readme) : [];
    const matchedSections = new Set(
      headings
        .map((h) => h.toLowerCase())
        .filter((h) => SECTION_KEYWORDS.some((k) => h.includes(k))),
    );
    const sectionRatio = clamp01(matchedSections.size / 5);
    signals.push(
      signal({
        id: 'readme.sections',
        label: 'README covers the sections an assistant looks for',
        weight: 16,
        status: matchedSections.size >= 5 ? 'met' : matchedSections.size >= 2 ? 'partial' : 'missing',
        detail:
          matchedSections.size > 0
            ? `${matchedSections.size} recognized: ${[...matchedSections].slice(0, 6).join(', ')}`
            : 'no recognized sections',
        earned: 16 * sectionRatio,
      }),
    );

    // --- README code examples ---
    const fences = readme ? (readme.match(/```/g)?.length ?? 0) >> 1 : 0;
    signals.push(
      signal({
        id: 'readme.codeExamples',
        label: 'README shows runnable code examples',
        weight: 8,
        status: fences >= 2 ? 'met' : fences === 1 ? 'partial' : 'missing',
        detail: `${fences} fenced code block(s)`,
      }),
    );

    // --- Architecture docs ---
    const archDoc = tree.files.find((f) => ARCH_DOC_RE.test(f) && basename(f).toLowerCase() !== 'readme.md');
    const readmeHasArch = matchedSections.has('architecture') || matchedSections.has('design');
    signals.push(
      signal({
        id: 'architecture.docs',
        label: 'Architecture is documented',
        weight: 16,
        status: archDoc ? 'met' : readmeHasArch ? 'partial' : 'missing',
        detail: archDoc
          ? archDoc
          : readmeHasArch
            ? 'only an Architecture section in the README'
            : 'no architecture / design doc',
      }),
    );

    // --- Comment density ---
    const repo = classifyRepo(tree);
    const comments = await analyzeComments(tree.root, repo.source);
    const enoughCode = comments.codeLines >= 50;
    const commentRatio = enoughCode
      ? clamp01((comments.ratio - 0.01) / (0.08 - 0.01))
      : 0.5;
    signals.push(
      signal({
        id: 'comments.density',
        label: 'Source carries explanatory comments',
        weight: 12,
        status: !enoughCode ? 'partial' : comments.ratio >= 0.06 ? 'met' : comments.ratio >= 0.02 ? 'partial' : 'missing',
        detail: enoughCode
          ? `${pct(comments.ratio)} of source lines are comments (${comments.commentLines}/${comments.commentLines + comments.codeLines})`
          : 'too little source code to assess',
        earned: 12 * commentRatio,
      }),
    );

    // --- Type coverage ---
    const types = await analyzeTypeCoverage(tree.root, repo, tree);
    signals.push(
      signal({
        id: 'types.coverage',
        label: 'Code is type-annotated',
        weight: 12,
        status: types.score >= 0.75 ? 'met' : types.score >= 0.4 ? 'partial' : 'missing',
        detail: repo.source.length ? `${pct(types.score)} (${types.detail})` : 'no source files',
        earned: 12 * types.score,
      }),
    );

    return finalize(
      'context',
      signals,
      ctx,
      (s) =>
        s >= 80
          ? 'Rich surrounding context: an assistant can orient quickly.'
          : s >= 55
            ? 'Usable context, but an assistant will have to guess at some intent.'
            : 'Thin context — an assistant starts most tasks under-informed.',
      (weak, s) => {
        const prio = priorityFor(s, ctx.remediationThreshold);
        const items = [];
        const has = (id: string) => weak.some((w) => w.id === id);

        if (has('readme.present')) {
          items.push(
            remediation(
              'context',
              'Add a README.md at the repository root',
              'Start with a one-paragraph description of what this project is and who it is for, then Installation and Usage sections.',
              'high',
            ),
          );
        } else if (has('readme.depth') || has('readme.sections')) {
          const missing = SECTION_KEYWORDS.filter(
            (k) => !['install', 'example', 'examples'].includes(k),
          );
          items.push(
            remediation(
              'context',
              'Expand the README',
              `It currently has ${chars} chars and ${matchedSections.size} recognized section(s). Add the ones you are missing (Overview, Installation, Usage, Configuration, Architecture, Contributing). Reference examples: ${missing
                .slice(0, 4)
                .join(', ')}.`,
              prio,
            ),
          );
        }
        if (has('readme.codeExamples')) {
          items.push(
            remediation(
              'context',
              'Add a copy-pasteable usage example to the README',
              'Include at least one fenced code block showing the primary entry point being called with realistic arguments.',
              'low',
            ),
          );
        }
        if (has('architecture.docs')) {
          items.push(
            remediation(
              'context',
              'Document the architecture',
              'Add ARCHITECTURE.md (or docs/architecture.md) describing the main modules, how a request flows through them, and where the key decisions live. Consider an docs/adr/ folder for decision records.',
              prio,
            ),
          );
        }
        if (has('comments.density')) {
          items.push(
            remediation(
              'context',
              'Comment the non-obvious code',
              `Comments are ${pct(comments.ratio)} of source lines. Add short "why" comments on public functions and any surprising control flow — aim for roughly 8-15%.`,
              'low',
            ),
          );
        }
        if (has('types.coverage')) {
          items.push(
            remediation(
              'context',
              'Increase type coverage',
              repo.primaryLanguage === 'js' || repo.primaryLanguage === 'jsx'
                ? 'Add JSDoc @param/@returns to exported functions, or adopt `// @ts-check` / a checkJs jsconfig so an assistant can infer shapes.'
                : repo.primaryLanguage === 'py'
                  ? 'Add type hints to function signatures (parameters and return types); enable a checker like mypy or pyright.'
                  : 'Enable `"strict": true` in tsconfig.json and annotate exported APIs explicitly.',
              prio,
            ),
          );
        }
        return items;
      },
    );
  },
};

function extractHeadings(markdown: string): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const m = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      out.push(m[2].trim());
    }
  }
  return out;
}

function clamp01(n: number): number {
  return Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n));
}
