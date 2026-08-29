/**
 * Navigability — can a coding assistant predict where things live? Rewards a
 * real source root (not a flat dump), consistent file naming, conventional
 * module groupings, a discoverable entry point, and sane directory depth /
 * folder sizes.
 */

import { readPackageJson } from '../detect';
import { basename, classifyRepo } from '../source';
import { priorityFor } from '../weights';
import type { DimensionScorer, ScanContext, Signal } from '../types';
import { finalize, pct, remediation, signal } from './util';

const SOURCE_ROOTS = ['src', 'lib', 'app', 'pkg', 'cmd', 'internal', 'source', 'packages'];
const CONVENTIONAL_DIRS = [
  'components',
  'services',
  'models',
  'model',
  'utils',
  'util',
  'helpers',
  'lib',
  'api',
  'routes',
  'handlers',
  'controllers',
  'middleware',
  'hooks',
  'types',
  'schemas',
  'store',
  'stores',
  'config',
  'core',
  'domain',
  'adapters',
  'repositories',
  'entities',
  'usecases',
  'features',
  'modules',
  'views',
  'pages',
  'layouts',
  'workers',
  'jobs',
  'migrations',
];
const ENTRYPOINTS =
  /^(index|main|app|server|cli|__main__|mod)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java)$/i;

export const navigabilityScorer: DimensionScorer = {
  id: 'navigability',
  async score(ctx: ScanContext) {
    const { tree } = ctx;
    const repo = classifyRepo(tree);
    const pkg = await readPackageJson(tree);
    const src = repo.source;

    const signals: Signal[] = [];

    // --- Source root (not flat) ---
    const rootDir = tree.dirs.find((d) => SOURCE_ROOTS.includes(d.toLowerCase()));
    const underRoot = rootDir
      ? src.filter((f) => f.path.toLowerCase().startsWith(rootDir.toLowerCase() + '/')).length
      : 0;
    const atRepoRoot = src.filter((f) => !f.path.includes('/')).length;
    const nestedFrac = src.length ? (src.length - atRepoRoot) / src.length : 0;
    const notFlatStatus =
      rootDir && underRoot / Math.max(1, src.length) >= 0.6
        ? 'met'
        : nestedFrac >= 0.5
          ? 'partial'
          : 'missing';
    signals.push(
      signal({
        id: 'structure.sourceRoot',
        label: 'Source lives under a clear root, not dumped at the top level',
        weight: 20,
        status: notFlatStatus,
        detail: rootDir
          ? `${underRoot}/${src.length} source files under ${rootDir}/`
          : `${atRepoRoot}/${src.length} source files sit at the repository root`,
        earned: 20 * (notFlatStatus === 'met' ? 1 : notFlatStatus === 'partial' ? 0.5 : nestedFrac * 0.4),
      }),
    );

    // --- Naming consistency ---
    const naming = analyzeNaming(src.map((f) => basename(f.path)));
    signals.push(
      signal({
        id: 'naming.consistency',
        label: 'File names follow one convention',
        weight: 22,
        status: naming.assessable
          ? naming.dominantFrac >= 0.85
            ? 'met'
            : naming.dominantFrac >= 0.65
              ? 'partial'
              : 'missing'
          : 'partial',
        detail: naming.assessable
          ? `${pct(naming.dominantFrac)} ${naming.dominant} (of ${naming.total} multi-word names)`
          : 'too few multi-word file names to assess',
        earned: 22 * (naming.assessable ? naming.dominantFrac : 0.6),
      }),
    );

    // --- Module grouping ---
    // Reward ANY consistent sub-module structure (by feature or by layer), not
    // just a fixed vocabulary. Conventional folder names are a bonus, not a gate.
    const rootPrefix = rootDir ? rootDir.toLowerCase() + '/' : '';
    const relFromRoot = src.map((f) =>
      rootPrefix && f.path.toLowerCase().startsWith(rootPrefix)
        ? f.path.slice(rootPrefix.length)
        : f.path,
    );
    const grouped = relFromRoot.filter((p) => p.includes('/'));
    const subGroups = new Set(grouped.map((p) => p.slice(0, p.indexOf('/')).toLowerCase()));
    const conventional = new Set(
      tree.dirs.map((d) => basename(d).toLowerCase()).filter((b) => CONVENTIONAL_DIRS.includes(b)),
    );
    const isMonorepo = tree.dirs.some((d) => /^(packages|apps|libs)\//.test(d));
    const groupedFrac = src.length ? grouped.length / src.length : 0;
    const cohesionFrac = clamp01(
      groupedFrac +
        (subGroups.size >= 2 ? 0.15 : 0) +
        Math.min(conventional.size, 3) * 0.05 +
        (isMonorepo ? 0.15 : 0),
    );
    signals.push(
      signal({
        id: 'structure.cohesion',
        label: 'Modules are grouped into purpose-named folders',
        weight: 18,
        status: src.length <= 3 ? 'met' : cohesionFrac >= 0.75 ? 'met' : cohesionFrac >= 0.35 ? 'partial' : 'missing',
        detail:
          subGroups.size > 0
            ? `${grouped.length}/${src.length} source files grouped into ${subGroups.size} folder(s): ${[...subGroups].slice(0, 8).join(', ')}${isMonorepo ? ' (monorepo)' : ''}`
            : 'source files are not grouped into sub-folders',
        earned: 18 * (src.length <= 3 ? 1 : cohesionFrac),
      }),
    );

    // --- Entry point ---
    const entry =
      src.find((f) => ENTRYPOINTS.test(basename(f.path))) ??
      (pkg?.main ? { path: String(pkg.main) } : undefined) ??
      (pkg?.bin ? { path: 'package.json#bin' } : undefined);
    signals.push(
      signal({
        id: 'structure.entrypoint',
        label: 'The entry point is discoverable',
        weight: 14,
        status: entry ? 'met' : 'missing',
        detail: entry ? ('path' in entry ? entry.path : String(entry)) : 'no index/main/app file or package "main"',
      }),
    );

    // --- Directory depth ---
    const depths = src.map((f) => f.path.split('/').length - 1);
    const maxDepth = depths.length ? Math.max(...depths) : 0;
    const depthOk = maxDepth >= 1 && maxDepth <= 6;
    signals.push(
      signal({
        id: 'structure.depth',
        label: 'Directory nesting is neither flat nor excessive',
        weight: 12,
        status: depthOk ? 'met' : maxDepth === 0 ? 'missing' : 'partial',
        detail: `max source depth ${maxDepth}`,
        earned: depthOk ? 12 : maxDepth === 0 ? 0 : maxDepth <= 8 ? 7 : 3,
      }),
    );

    // --- Folder sizes (no dumping grounds) ---
    const perDir = new Map<string, number>();
    for (const f of src) {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '.';
      perDir.set(dir, (perDir.get(dir) ?? 0) + 1);
    }
    const biggest = [...perDir.entries()].sort((a, b) => b[1] - a[1])[0];
    const dumpLimit = Math.max(15, Math.ceil(src.length * 0.5));
    const hasDump = !!biggest && biggest[1] > dumpLimit && src.length > 12;
    signals.push(
      signal({
        id: 'structure.folderSizes',
        label: 'No single folder is a dumping ground',
        weight: 14,
        status: src.length <= 12 ? 'met' : hasDump ? 'missing' : 'met',
        detail: biggest
          ? `largest folder: ${biggest[0]} with ${biggest[1]} source file(s)`
          : 'n/a',
        earned: src.length <= 12 ? 14 : hasDump ? 4 : 14,
      }),
    );

    return finalize(
      'navigability',
      signals,
      ctx,
      (s) =>
        s >= 80
          ? 'Predictable layout: an assistant can guess where a given piece of code lives.'
          : s >= 50
            ? 'Mostly navigable, with some inconsistency an assistant will trip on.'
            : 'Hard to navigate: flat and/or inconsistently organized.',
      (weak, s) => {
        const prio = priorityFor(s, ctx.remediationThreshold);
        const items = [];
        const has = (id: string) => weak.some((w) => w.id === id);

        if (has('structure.sourceRoot')) {
          items.push(
            remediation(
              'navigability',
              'Move source into a dedicated root',
              `${atRepoRoot} source file(s) sit at the repository top level. Create src/ (or lib/, pkg/) and move implementation files there, keeping only config and docs at the root.`,
              'high',
            ),
          );
        }
        if (has('naming.consistency')) {
          items.push(
            remediation(
              'navigability',
              'Standardize file naming',
              naming.assessable
                ? `Names are mixed: ${pct(naming.dominantFrac)} ${naming.dominant}, the rest ${naming.others.join('/') || 'other styles'}. Pick one (${naming.dominant}) and rename the outliers.`
                : 'Adopt a single file-naming convention (kebab-case or camelCase for modules, PascalCase for classes/components) and apply it consistently.',
              prio,
            ),
          );
        }
        if (has('structure.cohesion')) {
          items.push(
            remediation(
              'navigability',
              'Group modules by purpose',
              'Introduce intent-named folders (e.g. services/, models/, utils/, api/, routes/) so related files sit together and an assistant can infer where new code belongs.',
              prio,
            ),
          );
        }
        if (has('structure.entrypoint')) {
          items.push(
            remediation(
              'navigability',
              'Provide a clear entry point',
              'Add an index/main file at the source root that wires the pieces together, and set the "main" (or "bin") field in the manifest so tools and readers find it immediately.',
              'medium',
            ),
          );
        }
        if (has('structure.depth')) {
          items.push(
            remediation(
              'navigability',
              maxDepth === 0 ? 'Add folder structure' : 'Flatten deep nesting',
              maxDepth === 0
                ? 'Everything is at one level. Introduce at least one layer of purpose-named subfolders.'
                : `Source nests ${maxDepth} levels deep. Aim for 2–4; collapse pass-through folders that hold a single child.`,
              'low',
            ),
          );
        }
        if (has('structure.folderSizes')) {
          items.push(
            remediation(
              'navigability',
              'Break up the largest folder',
              biggest ? `${biggest[0]} holds ${biggest[1]} source files. Split it into sub-folders by feature or layer.` : 'Split oversized folders by feature or layer.',
              'medium',
            ),
          );
        }
        return items;
      },
    );
  },
};

interface NamingAnalysis {
  assessable: boolean;
  total: number;
  dominant: string;
  dominantFrac: number;
  others: string[];
}

type Casing = 'kebab' | 'snake' | 'camelCase' | 'PascalCase' | 'dotted' | 'lower' | 'other';

function casingOf(fileName: string): Casing {
  let stem = fileName.replace(/\.[^.]+$/, '');
  // Drop a trailing ".test" / ".spec" / ".d" qualifier before judging the style.
  stem = stem.replace(/\.(test|spec|d|stories|module|component|service)$/i, '');
  if (stem.includes('.')) {
    return 'dotted';
  }
  if (/^[a-z0-9]+$/.test(stem)) {
    return 'lower';
  }
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(stem)) {
    return 'kebab';
  }
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(stem)) {
    return 'snake';
  }
  if (/^[a-z][a-zA-Z0-9]*$/.test(stem) && /[A-Z]/.test(stem)) {
    return 'camelCase';
  }
  if (/^[A-Z][a-zA-Z0-9]*$/.test(stem) && /[a-z]/.test(stem)) {
    return 'PascalCase';
  }
  return 'other';
}

function analyzeNaming(fileNames: string[]): NamingAnalysis {
  const counts = new Map<Casing, number>();
  for (const name of fileNames) {
    const c = casingOf(name);
    // Single lowercase words fit every convention; ignore for the consistency judgement.
    if (c === 'lower' || c === 'dotted' || c === 'other') {
      continue;
    }
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total < 4) {
    return { assessable: false, total, dominant: 'n/a', dominantFrac: 1, others: [] };
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // camelCase and PascalCase commonly coexist legitimately (modules vs components).
  let dominant: string = sorted[0][0];
  let top = sorted[0][1];
  const pascal = counts.get('PascalCase') ?? 0;
  const camel = counts.get('camelCase') ?? 0;
  if ((dominant === 'camelCase' || dominant === 'PascalCase') && pascal > 0 && camel > 0) {
    top = pascal + camel;
    dominant = 'camelCase/PascalCase';
  }
  return {
    assessable: true,
    total,
    dominant,
    dominantFrac: top / total,
    others: sorted.filter(([k]) => k !== sorted[0][0]).map(([k]) => k),
  };
}

function clamp01(n: number): number {
  return Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n));
}
