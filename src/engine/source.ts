/**
 * Language classification and lightweight source analysis shared by several
 * scorers (Context needs comment density and type coverage; Verifiability and
 * Navigability need the source/test file split).
 *
 * Everything here is heuristic and cheap — we sample file contents rather than
 * parse them. Pure Node, no `vscode`.
 */

import { readFileSafe } from './fsUtils';
import type { RepoTree } from './types';

export type Language =
  | 'ts'
  | 'tsx'
  | 'js'
  | 'jsx'
  | 'py'
  | 'go'
  | 'rust'
  | 'java'
  | 'csharp'
  | 'kotlin'
  | 'swift'
  | 'scala'
  | 'cpp'
  | 'c'
  | 'ruby'
  | 'php'
  | 'shell'
  | 'other';

const EXT_LANG: Record<string, Language> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.jsx': 'jsx',
  '.py': 'py',
  '.pyi': 'py',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cs': 'csharp',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.scala': 'scala',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'shell',
  '.bash': 'shell',
};

/** Languages whose type system gives an assistant strong structural signal for free. */
const STATICALLY_TYPED: ReadonlySet<Language> = new Set<Language>([
  'ts',
  'tsx',
  'go',
  'rust',
  'java',
  'csharp',
  'kotlin',
  'swift',
  'scala',
  'cpp',
  'c',
]);

/** Languages where annotations are optional and worth measuring. */
const GRADUALLY_TYPED: ReadonlySet<Language> = new Set<Language>(['py', 'php']);

export interface CommentSyntax {
  line: string[];
  block: Array<[string, string]>;
}

function syntaxFor(lang: Language): CommentSyntax {
  switch (lang) {
    case 'py':
      return { line: ['#'], block: [['"""', '"""'], ["'''", "'''"]] };
    case 'ruby':
      return { line: ['#'], block: [['=begin', '=end']] };
    case 'shell':
      return { line: ['#'], block: [] };
    default:
      return { line: ['//'], block: [['/*', '*/']] };
  }
}

export interface ClassifiedFile {
  path: string;
  ext: string;
  lang: Language;
  kind: 'source' | 'test' | 'doc' | 'config' | 'other';
}

const TEST_DIR_RE = /(^|\/)(tests?|specs?|__tests__|e2e|integration-tests|testing)(\/|$)/i;
const TEST_FILE_RE =
  /(\.(test|spec)\.[cm]?[jt]sx?$)|(_test\.(go|py|rb)$)|(^test_.*\.py$)|(Tests?\.(java|kt|cs|scala)$)|(_spec\.rb$)|(\.spec\.ts$)/i;

const DOC_EXT = new Set(['.md', '.mdx', '.rst', '.adoc', '.txt']);
const CONFIG_BASENAMES = new Set([
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  'pipfile',
  'go.mod',
  'cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'gemfile',
  'composer.json',
  'makefile',
  'dockerfile',
]);

export function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

export function extname(p: string): string {
  const b = basename(p);
  const dot = b.lastIndexOf('.');
  return dot <= 0 ? '' : b.slice(dot).toLowerCase();
}

export function classify(path: string): ClassifiedFile {
  const ext = extname(path);
  const base = basename(path).toLowerCase();
  const lang = EXT_LANG[ext] ?? 'other';

  if (DOC_EXT.has(ext)) {
    return { path, ext, lang, kind: 'doc' };
  }
  if (
    CONFIG_BASENAMES.has(base) ||
    ext === '.yml' ||
    ext === '.yaml' ||
    ext === '.toml' ||
    ext === '.ini' ||
    /\.(config|conf)\.[cm]?[jt]sx?$/.test(base) ||
    /^\.[a-z]*(rc)(\.[a-z]+)?$/.test(base) ||
    /^(vitest|vite|jest|webpack|rollup|babel|prettier|eslint|tailwind|postcss|playwright|cypress|karma|nuxt|next|svelte|astro|drizzle|knexfile)\b/.test(base)
  ) {
    return { path, ext, lang, kind: 'config' };
  }
  if (lang === 'other') {
    return { path, ext, lang, kind: 'other' };
  }
  if (TEST_DIR_RE.test(path) || TEST_FILE_RE.test(base)) {
    return { path, ext, lang, kind: 'test' };
  }
  return { path, ext, lang, kind: 'source' };
}

export interface RepoSource {
  all: ClassifiedFile[];
  source: ClassifiedFile[];
  test: ClassifiedFile[];
  /** file count per language, source files only. */
  languages: Map<Language, number>;
  /** dominant source language, or undefined for a non-code repo. */
  primaryLanguage?: Language;
}

export function classifyRepo(tree: RepoTree): RepoSource {
  const all = tree.files.map(classify);
  const source = all.filter((f) => f.kind === 'source');
  const test = all.filter((f) => f.kind === 'test');
  const languages = new Map<Language, number>();
  for (const f of source) {
    languages.set(f.lang, (languages.get(f.lang) ?? 0) + 1);
  }
  let primaryLanguage: Language | undefined;
  let best = 0;
  for (const [lang, n] of languages) {
    if (n > best) {
      best = n;
      primaryLanguage = lang;
    }
  }
  return { all, source, test, languages, primaryLanguage };
}

export interface CommentStats {
  files: number;
  commentLines: number;
  codeLines: number;
  /** commentLines / (commentLines + codeLines), 0 when there is no code. */
  ratio: number;
}

interface SampleOptions {
  maxFiles?: number;
  maxBytesPerFile?: number;
}

/** Sample source files and estimate comment density. */
export async function analyzeComments(
  root: string,
  files: ClassifiedFile[],
  opts: SampleOptions = {},
): Promise<CommentStats> {
  const maxFiles = opts.maxFiles ?? 200;
  const maxBytes = opts.maxBytesPerFile ?? 200_000;
  const sample = evenSample(files, maxFiles);

  let commentLines = 0;
  let codeLines = 0;
  let counted = 0;

  for (const f of sample) {
    const content = await readFileSafe(root, f.path);
    if (content === undefined) {
      continue;
    }
    counted++;
    const { comments, code } = countLines(content.slice(0, maxBytes), syntaxFor(f.lang));
    commentLines += comments;
    codeLines += code;
  }

  const total = commentLines + codeLines;
  return {
    files: counted,
    commentLines,
    codeLines,
    ratio: total === 0 ? 0 : commentLines / total,
  };
}

function countLines(content: string, syntax: CommentSyntax): { comments: number; code: number } {
  let comments = 0;
  let code = 0;
  let blockCloser: string | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (blockCloser) {
      comments++;
      if (line.includes(blockCloser)) {
        blockCloser = undefined;
      }
      continue;
    }
    if (line === '') {
      continue;
    }
    if (syntax.line.some((tok) => line.startsWith(tok))) {
      comments++;
      continue;
    }
    const open = syntax.block.find(([o]) => line.startsWith(o));
    if (open) {
      comments++;
      const rest = line.slice(open[0].length);
      if (!rest.includes(open[1])) {
        blockCloser = open[1];
      }
      continue;
    }
    code++;
  }
  return { comments, code };
}

export interface TypeCoverage {
  /** 0..1 estimate of how much type information an assistant can lean on. */
  score: number;
  detail: string;
}

/**
 * Estimate type coverage. Statically typed languages get near-full credit
 * (adjusted for TS strictness); gradually typed languages are measured by
 * annotation density; dynamic languages get credit for JSDoc / `@ts-check`.
 */
export async function analyzeTypeCoverage(
  root: string,
  repo: RepoSource,
  tree: RepoTree,
): Promise<TypeCoverage> {
  if (repo.source.length === 0) {
    return { score: 0, detail: 'no source files detected' };
  }

  let weighted = 0;
  const parts: string[] = [];
  for (const [lang, count] of repo.languages) {
    const frac = count / repo.source.length;
    let langScore: number;

    if (STATICALLY_TYPED.has(lang)) {
      langScore = 1;
      if (lang === 'ts' || lang === 'tsx') {
        langScore = tsStrict(tree, await readFileSafe(root, findTsconfig(tree) ?? '')) ? 1 : 0.75;
      }
    } else if (GRADUALLY_TYPED.has(lang)) {
      langScore = await annotationDensity(root, repo.source.filter((f) => f.lang === lang), lang);
    } else if (lang === 'js' || lang === 'jsx') {
      langScore = await jsTypedness(root, repo.source.filter((f) => f.lang === lang), tree);
    } else {
      langScore = 0.4;
    }

    weighted += langScore * frac;
    parts.push(`${lang} ${(langScore * 100) | 0}%`);
  }

  return { score: clamp01(weighted), detail: parts.join(', ') };
}

function findTsconfig(tree: RepoTree): string | undefined {
  return tree.files.find((f) => basename(f).toLowerCase() === 'tsconfig.json');
}

function tsStrict(_tree: RepoTree, tsconfigContent: string | undefined): boolean {
  if (!tsconfigContent) {
    return false;
  }
  try {
    const json = JSON.parse(stripJsonComments(tsconfigContent));
    const co = json.compilerOptions ?? {};
    return co.strict === true || co.strictNullChecks === true || co.noImplicitAny === true;
  } catch {
    return /"strict"\s*:\s*true/.test(tsconfigContent);
  }
}

async function annotationDensity(
  root: string,
  files: ClassifiedFile[],
  lang: Language,
): Promise<number> {
  const defRe = lang === 'py' ? /^\s*def\s+\w+\s*\(/ : /function\s+\w+\s*\(/;
  const annotatedRe = lang === 'py' ? /(->\s*[\w.\[\]]+\s*:)|(:\s*[\w.\[\]]+\s*[,)=])/ : /:\s*[\w<>\[\]]+/;
  let defs = 0;
  let annotated = 0;
  for (const f of evenSample(files, 120)) {
    const content = await readFileSafe(root, f.path);
    if (!content) {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      if (defRe.test(line)) {
        defs++;
        if (annotatedRe.test(line)) {
          annotated++;
        }
      }
    }
  }
  if (defs === 0) {
    return 0.3;
  }
  return clamp01(0.15 + 0.85 * (annotated / defs));
}

async function jsTypedness(
  root: string,
  files: ClassifiedFile[],
  tree: RepoTree,
): Promise<number> {
  const hasDts = tree.files.some((f) => f.endsWith('.d.ts'));
  const tsconfig = await readFileSafe(root, findTsconfig(tree) ?? findJsconfig(tree) ?? '');
  const checkJs = !!tsconfig && /"checkJs"\s*:\s*true/.test(tsconfig);

  let jsdocFiles = 0;
  let tsCheckFiles = 0;
  const sample = evenSample(files, 120);
  for (const f of sample) {
    const content = await readFileSafe(root, f.path);
    if (!content) {
      continue;
    }
    if (/\/\/\s*@ts-check/.test(content)) {
      tsCheckFiles++;
    }
    if (/@(param|returns?|type)\s/.test(content)) {
      jsdocFiles++;
    }
  }
  const jsdocFrac = sample.length ? jsdocFiles / sample.length : 0;
  const tsCheckFrac = sample.length ? tsCheckFiles / sample.length : 0;

  let score = 0.15;
  score += 0.5 * jsdocFrac;
  score += 0.3 * tsCheckFrac;
  if (checkJs) {
    score += 0.25;
  }
  if (hasDts) {
    score += 0.1;
  }
  return clamp01(score);
}

function findJsconfig(tree: RepoTree): string | undefined {
  return tree.files.find((f) => basename(f).toLowerCase() === 'jsconfig.json');
}

export interface DocCommentStats {
  definitions: number;
  documented: number;
  /** documented / definitions, 0 when there are no definitions. */
  ratio: number;
  files: number;
}

const DEF_RE: Partial<Record<Language, RegExp>> = {
  ts: /^\s*export\s+(default\s+)?(async\s+)?(function|class|const|interface|type|enum|abstract)\b/,
  tsx: /^\s*export\s+(default\s+)?(async\s+)?(function|class|const|interface|type|enum|abstract)\b/,
  js: /^\s*(export\s+(default\s+)?)?(async\s+)?(function|class)\s+\w+/,
  jsx: /^\s*(export\s+(default\s+)?)?(async\s+)?(function|class)\s+\w+/,
  py: /^\s*(async\s+)?def\s+\w+|^\s*class\s+\w+/,
  go: /^func\s+(\([^)]*\)\s*)?[A-Z]\w*/,
  rust: /^\s*(pub(\([^)]*\))?\s+)(async\s+)?(fn|struct|enum|trait)\s+\w+/,
  java: /^\s*(public|protected)\s+.*\b\w+\s*\([^;]*\)\s*(\{|throws)/,
};

/**
 * Estimate how many public definitions carry a doc comment. This is the
 * Documentation dimension's core measurement — comments that explain the API,
 * not just inline notes.
 */
export async function analyzeDocComments(root: string, repo: RepoSource): Promise<DocCommentStats> {
  let definitions = 0;
  let documented = 0;
  let files = 0;

  for (const f of evenSample(repo.source, 160)) {
    const defRe = DEF_RE[f.lang];
    if (!defRe) {
      continue;
    }
    const content = await readFileSafe(root, f.path);
    if (!content) {
      continue;
    }
    files++;
    const lines = content.split(/\r?\n/);
    const pyLike = f.lang === 'py';

    for (let i = 0; i < lines.length; i++) {
      if (!defRe.test(lines[i])) {
        continue;
      }
      definitions++;
      if (pyLike) {
        // Docstring on the next non-blank line.
        const next = (lines[i + 1] ?? '').trim();
        if (next.startsWith('"""') || next.startsWith("'''")) {
          documented++;
        }
      } else {
        // Doc comment on the preceding lines (allow decorators/annotations between).
        let j = i - 1;
        while (j >= 0 && (lines[j].trim() === '' || lines[j].trim().startsWith('@'))) {
          j--;
        }
        const prev = (lines[j] ?? '').trim();
        if (prev.endsWith('*/') || prev.startsWith('///') || prev.startsWith('//!')) {
          documented++;
        }
      }
    }
  }

  return {
    definitions,
    documented,
    files,
    ratio: definitions === 0 ? 0 : documented / definitions,
  };
}

/** Take up to `n` items spread evenly across the list (not just the first n). */
export function evenSample<T>(items: T[], n: number): T[] {
  if (items.length <= n) {
    return items;
  }
  const step = items.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(items[Math.floor(i * step)]);
  }
  return out;
}

export function clamp01(n: number): number {
  return Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n));
}

/** Tolerant of `// comments` and trailing commas commonly found in tsconfig. */
export function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}
