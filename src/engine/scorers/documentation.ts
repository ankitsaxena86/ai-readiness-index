/**
 * Documentation — everything beyond the README that helps someone (or an
 * assistant) understand the system: a docs/ tree, decision records, API
 * reference, doc comments on public definitions, and the supporting files
 * (CONTRIBUTING, SECURITY, examples) that set expectations.
 */

import { findRootFile, readFileSafe } from '../fsUtils';
import { detectChangelog } from '../detect';
import { analyzeDocComments, basename, classifyRepo } from '../source';
import { priorityFor } from '../weights';
import type { DimensionScorer, RepoTree, ScanContext, Signal } from '../types';
import { finalize, pct, remediation, signal } from './util';

const ADR_RE = /(^|\/)(docs\/)?(adr|adrs|rfcs?|decisions|architecture-decisions)\/.+\.(md|mdx|rst|adoc)$/i;
const API_DOC_RE = /(^|\/)docs?\/.*\b(api|reference|endpoints|sdk)\b.*\.(md|mdx|rst|adoc)$|(^|\/)api\.(md|mdx|rst)$/i;
const DOC_GENERATOR_FILES =
  /^(typedoc\.json|typedoc\.js|\.typedoc\.json|jsdoc\.json|\.jsdoc\.json|mkdocs\.ya?ml|docusaurus\.config\.[jt]s|conf\.py|\.readthedocs\.ya?ml|api-extractor\.json)$/i;
const SUPPORTING_DOCS = /^(code_of_conduct|security|support|governance|maintainers|authors|codeowners)(\.(md|txt))?$/i;

export const documentationScorer: DimensionScorer = {
  id: 'documentation',
  async score(ctx: ScanContext) {
    const { tree } = ctx;
    const repo = classifyRepo(tree);

    // --- CONTRIBUTING ---
    const contributing = findRootFile(tree, 'CONTRIBUTING.md', 'CONTRIBUTING', 'CONTRIBUTING.rst');
    const contributingInDocs = tree.files.find((f) => /(^|\/)docs\/contributing\.md$/i.test(f));
    const readme = await readFileSafe(tree.root, findRootFile(tree, 'README.md', 'README') ?? '');
    const readmeHasContributing = !!readme && /^\s*#{1,6}\s+contributing/im.test(readme);

    // --- docs/ directory ---
    const docFiles = tree.files.filter(
      (f) => /(^|\/)docs?\//i.test(f) && /\.(md|mdx|rst|adoc)$/i.test(f),
    );
    const docWords = await countWords(tree, docFiles, 40);

    // --- ADRs ---
    const adrFiles = tree.files.filter((f) => ADR_RE.test(f));

    // --- API docs ---
    const apiDocFile = tree.files.find((f) => API_DOC_RE.test(f));
    const docGenerator = tree.files.find((f) => DOC_GENERATOR_FILES.test(basename(f)));

    // --- doc comments on public API ---
    const docComments = await analyzeDocComments(tree.root, repo);

    // --- supporting docs ---
    const supporting = tree.files.filter((f) => SUPPORTING_DOCS.test(basename(f)));
    const hasExamples = tree.dirs.some((d) => /(^|\/)(examples?|samples?|demos?)$/i.test(d));
    const changelog = detectChangelog(tree);

    const signals: Signal[] = [];

    signals.push(
      signal({
        id: 'doc.contributing',
        label: 'CONTRIBUTING guidance exists',
        weight: 15,
        status: contributing || contributingInDocs ? 'met' : readmeHasContributing ? 'partial' : 'missing',
        detail:
          contributing || contributingInDocs
            ? (contributing ?? contributingInDocs)!
            : readmeHasContributing
              ? 'only a Contributing section in the README'
              : 'no CONTRIBUTING file',
      }),
    );

    signals.push(
      signal({
        id: 'doc.directory',
        label: 'A docs/ tree with real content',
        weight: 22,
        status: docFiles.length >= 3 && docWords >= 400 ? 'met' : docFiles.length >= 1 ? 'partial' : 'missing',
        detail: docFiles.length
          ? `${docFiles.length} doc file(s), ~${docWords} words`
          : 'no docs/ directory with prose',
        earned: 22 * clamp01((docFiles.length / 4) * 0.5 + clamp01(docWords / 1200) * 0.5),
      }),
    );

    signals.push(
      signal({
        id: 'doc.adr',
        label: 'Architecture / decision records',
        weight: 16,
        status: adrFiles.length >= 2 ? 'met' : adrFiles.length === 1 ? 'partial' : 'missing',
        detail: adrFiles.length ? `${adrFiles.length} record(s) under ${dirOf(adrFiles[0])}` : 'no ADR / decision-record folder',
      }),
    );

    signals.push(
      signal({
        id: 'doc.api',
        label: 'API / reference documentation',
        weight: 17,
        status:
          apiDocFile || docGenerator ? 'met' : docComments.ratio >= 0.6 ? 'partial' : 'missing',
        detail: apiDocFile
          ? apiDocFile
          : docGenerator
            ? `generated docs configured (${basename(docGenerator)})`
            : docComments.definitions
              ? `no dedicated API docs; ${pct(docComments.ratio)} of definitions have doc comments`
              : 'no API documentation',
      }),
    );

    signals.push(
      signal({
        id: 'doc.comments',
        label: 'Public definitions carry doc comments',
        weight: 18,
        status:
          docComments.definitions === 0
            ? 'partial'
            : docComments.ratio >= 0.6
              ? 'met'
              : docComments.ratio >= 0.25
                ? 'partial'
                : 'missing',
        detail:
          docComments.definitions === 0
            ? 'no analyzable public definitions found'
            : `${docComments.documented}/${docComments.definitions} definitions documented (${pct(docComments.ratio)})`,
        earned: docComments.definitions === 0 ? 9 : 18 * clamp01(docComments.ratio / 0.75),
      }),
    );

    signals.push(
      signal({
        id: 'doc.supporting',
        label: 'Supporting docs (CHANGELOG, SECURITY, examples, …)',
        weight: 12,
        status: score3(supporting.length + (changelog.found ? 1 : 0) + (hasExamples ? 1 : 0)),
        detail: describeSupporting(supporting, changelog.found, hasExamples),
        earned: 12 * clamp01((supporting.length + (changelog.found ? 1 : 0) + (hasExamples ? 1 : 0)) / 3),
      }),
    );

    return finalize(
      'documentation',
      signals,
      ctx,
      (s) =>
        s >= 80
          ? 'Well documented beyond the README: an assistant can learn the system from the repo alone.'
          : s >= 50
            ? 'Some documentation, but key references (API, decisions, or doc comments) are thin.'
            : 'Documentation barely exists beyond the README.',
      (weak, s) => {
        const prio = priorityFor(s, ctx.remediationThreshold);
        const items = [];
        const has = (id: string) => weak.some((w) => w.id === id);

        if (has('doc.contributing')) {
          items.push(
            remediation(
              'documentation',
              'Add a CONTRIBUTING.md',
              'Cover: how to set up the dev environment, how to run tests, the branch/PR workflow, and the coding conventions you expect. GitHub/GitLab surface this file automatically on new PRs.',
              prio,
            ),
          );
        }
        if (has('doc.directory')) {
          items.push(
            remediation(
              'documentation',
              'Start a docs/ directory',
              docFiles.length
                ? `docs/ has only ${docFiles.length} file(s) (~${docWords} words). Add topic docs: architecture, data model, deployment, common workflows.`
                : 'Create docs/ with at least an architecture overview and one "how to do X" guide. Keep it in-repo so it versions with the code.',
              prio,
            ),
          );
        }
        if (has('doc.adr')) {
          items.push(
            remediation(
              'documentation',
              'Record architecture decisions',
              'Add docs/adr/ using the lightweight Nygard format (Context / Decision / Consequences), one file per significant decision. Even 3–4 backfilled ADRs give an assistant the "why".',
              'low',
            ),
          );
        }
        if (has('doc.api')) {
          items.push(
            remediation(
              'documentation',
              'Publish API / reference docs',
              apiSuggestion(repo.primaryLanguage),
              prio,
            ),
          );
        }
        if (has('doc.comments')) {
          items.push(
            remediation(
              'documentation',
              'Document public functions and types',
              docComments.definitions
                ? `Only ${docComments.documented} of ${docComments.definitions} public definitions have a doc comment. Add a one-line purpose comment to each exported function/type — this is the single highest-leverage change for assistant accuracy.`
                : 'Add doc comments (JSDoc / docstrings / godoc) to your exported API.',
              'medium',
            ),
          );
        }
        if (has('doc.supporting')) {
          const missing: string[] = [];
          if (!changelog.found) {
            missing.push('CHANGELOG.md');
          }
          if (!supporting.some((f) => /security/i.test(f))) {
            missing.push('SECURITY.md');
          }
          if (!hasExamples) {
            missing.push('an examples/ directory');
          }
          items.push(
            remediation(
              'documentation',
              'Add the supporting docs',
              `Missing: ${missing.join(', ')}.${
                changelog.found ? '' : ' A CHANGELOG in Keep a Changelog format is the most useful one to start with.'
              }`,
              'low',
            ),
          );
        }
        return items;
      },
    );
  },
};

async function countWords(tree: RepoTree, files: string[], cap: number): Promise<number> {
  let words = 0;
  for (const f of files.slice(0, cap)) {
    const content = await readFileSafe(tree.root, f);
    if (content) {
      words += content.split(/\s+/).filter(Boolean).length;
    }
  }
  return words;
}

function dirOf(p: string): string {
  return p.slice(0, p.lastIndexOf('/')) || '.';
}

function score3(count: number): Signal['status'] {
  return count >= 3 ? 'met' : count >= 1 ? 'partial' : 'missing';
}

function describeSupporting(supporting: string[], changelog: boolean, examples: boolean): string {
  const found: string[] = [];
  if (changelog) {
    found.push('CHANGELOG');
  }
  for (const s of supporting) {
    found.push(basename(s));
  }
  if (examples) {
    found.push('examples/');
  }
  return found.length ? found.join(', ') : 'none found';
}

function apiSuggestion(lang: string | undefined): string {
  switch (lang) {
    case 'ts':
    case 'tsx':
      return 'Add TypeDoc (typedoc.json) to generate reference docs from your types, or hand-write docs/api.md for the public surface.';
    case 'py':
      return 'Add Sphinx (docs/conf.py) with autodoc, or MkDocs + mkdocstrings, to generate reference docs from docstrings.';
    case 'go':
      return 'Ensure exported identifiers have godoc comments; link pkg.go.dev in the README. Optionally add docs/api.md for hand-written guides.';
    case 'rust':
      return 'Write `///` doc comments on public items (rustdoc) and link the generated docs; add examples in doc comments.';
    default:
      return 'Add a docs/api.md describing the public entry points, their parameters, return values, and error cases — or wire up a doc generator for your language.';
  }
}

function clamp01(n: number): number {
  return Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n));
}
