/**
 * Reproducibility — could someone (or an assistant's sandbox) stand this repo
 * up and run it from a clean checkout? Looks for setup/build/run instructions,
 * pinned dependencies, a lockfile, a pinned runtime, and containerization.
 *
 * Containerization is treated as a bonus, not a requirement (per the rubric,
 * "containerization if present"): its absence costs only half its weight.
 */

import { findRootFile, readFileSafe } from '../fsUtils';
import {
  detectContainerization,
  detectLockfiles,
  detectRuntimePin,
  readPackageJson,
} from '../detect';
import { basename, classifyRepo } from '../source';
import { priorityFor } from '../weights';
import type { DimensionScorer, RepoTree, ScanContext, Signal } from '../types';
import { finalize, pct, remediation, signal } from './util';

const SETUP_HEADING_RE =
  /\b(installation|install|setup|set[- ]up|getting started|quick ?start|build|building|development|running|run locally|usage|prerequisites)\b/i;
const SETUP_COMMAND_RE =
  /(npm (ci|install|i)\b|yarn( install)?\b|pnpm i(nstall)?\b|bun install\b|pip install\b|poetry install\b|uv (sync|pip)\b|make\b|docker (build|compose|run)\b|cargo (build|run)\b|go (build|run|mod)\b|\.\/gradlew\b|mvn \b|bundle install\b|composer install\b)/;

const SETUP_DOC_NAMES = [
  'README.md',
  'README',
  'CONTRIBUTING.md',
  'INSTALL.md',
  'INSTALL',
  'DEVELOPMENT.md',
  'docs/installation.md',
  'docs/setup.md',
  'docs/getting-started.md',
  'docs/development.md',
  'docs/contributing.md',
];

export const reproducibilityScorer: DimensionScorer = {
  id: 'reproducibility',
  async score(ctx: ScanContext) {
    const { tree } = ctx;
    const repo = classifyRepo(tree);
    const pkg = await readPackageJson(tree);

    // --- Setup instructions ---
    const setupText = await gatherSetupText(tree);
    const hasSetupHeading = SETUP_HEADING_RE.test(setupText.headings);
    const hasSetupCommand = SETUP_COMMAND_RE.test(setupText.body);
    const setupStatus =
      hasSetupHeading && hasSetupCommand ? 'met' : hasSetupHeading || hasSetupCommand ? 'partial' : 'missing';

    // --- Dependency pinning ---
    const pinning = analyzePinning(pkg, await readFileSafe(tree.root, 'requirements.txt'));

    // --- Lockfile ---
    const lock = detectLockfiles(tree);
    const manifestEcosystems = detectManifests(tree);
    const lockConsistent =
      lock.found && (manifestEcosystems.length === 0 || lock.names.some((n) => manifestEcosystems.includes(n)));

    // --- Runtime pin ---
    const runtime = detectRuntimePin(tree, pkg);

    // --- Containerization (bonus) ---
    const container = detectContainerization(tree);

    const signals: Signal[] = [];

    signals.push(
      signal({
        id: 'setup.instructions',
        label: 'Setup / build / run instructions are written down',
        weight: 26,
        status: setupStatus,
        detail:
          setupStatus === 'met'
            ? `instructions with runnable commands in ${setupText.source}`
            : setupStatus === 'partial'
              ? hasSetupHeading
                ? 'a setup section exists but has no concrete commands'
                : 'setup commands appear but under no clear heading'
              : 'no setup / installation instructions found',
      }),
    );

    signals.push(
      signal({
        id: 'deps.pinned',
        label: 'Dependency versions are constrained',
        weight: 22,
        status: pinning.assessable ? (pinning.score >= 0.8 ? 'met' : pinning.score >= 0.4 ? 'partial' : 'missing') : 'partial',
        detail: pinning.detail,
        earned: 22 * (pinning.assessable ? pinning.score : 0.6),
      }),
    );

    signals.push(
      signal({
        id: 'lockfile.present',
        label: 'A dependency lockfile is committed',
        weight: 24,
        status: lock.found ? (lockConsistent ? 'met' : 'partial') : manifestEcosystems.length ? 'missing' : 'partial',
        detail: lock.found
          ? `${lock.names.join(', ')} (${lock.evidence[0]})${lockConsistent ? '' : ' — no matching manifest found'}`
          : manifestEcosystems.length
            ? `manifest for ${manifestEcosystems.join(', ')} but no lockfile`
            : 'no package manifest, so no lockfile expected',
        earned: lock.found ? (lockConsistent ? 24 : 16) : manifestEcosystems.length ? 0 : 14,
      }),
    );

    signals.push(
      signal({
        id: 'runtime.pinned',
        label: 'The language runtime / toolchain version is pinned',
        weight: 14,
        status: runtime.found ? 'met' : 'missing',
        detail: runtime.found ? `${runtime.names.join(', ')} (${runtime.evidence[0]})` : 'no runtime version file or engines field',
      }),
    );

    signals.push(
      signal({
        id: 'containerization',
        label: 'A container / reproducible environment is provided (bonus)',
        weight: 14,
        status: container.found ? 'met' : 'partial',
        detail: container.found
          ? `${container.names.join(', ')} (${container.evidence[0]})`
          : 'no Dockerfile / compose / devcontainer / Nix — optional but valuable',
        earned: container.found ? 14 : 7,
      }),
    );

    return finalize(
      'reproducibility',
      signals,
      ctx,
      (s) =>
        s >= 80
          ? 'A clean checkout can be built and run from the written instructions.'
          : s >= 50
            ? 'Reproducible with some guesswork — a few steps are undocumented or unpinned.'
            : 'Hard to reproduce: setup is undocumented and/or dependencies float.',
      (weak, s) => {
        const prio = priorityFor(s, ctx.remediationThreshold);
        const items = [];
        const has = (id: string) => weak.some((w) => w.id === id);

        if (has('setup.instructions')) {
          items.push(
            remediation(
              'reproducibility',
              'Document how to set up and run the project',
              hasSetupHeading
                ? 'Your setup section has no concrete commands. Add the exact shell commands for install, build, test, and run from a clean checkout.'
                : `Add an Installation/Development section to the README with copy-pasteable commands (e.g. ${exampleCommands(repo)}).`,
              'high',
            ),
          );
        }
        if (has('deps.pinned')) {
          items.push(
            remediation(
              'reproducibility',
              'Constrain dependency versions',
              pinning.detail + '. Replace `*` / `latest` / unbounded ranges with explicit version constraints, and commit the lockfile.',
              prio,
            ),
          );
        }
        if (has('lockfile.present')) {
          items.push(
            remediation(
              'reproducibility',
              'Commit a lockfile',
              manifestEcosystems.length
                ? `A ${manifestEcosystems.join('/')} manifest is present but no lockfile is committed. Run the install once and commit the generated lockfile so builds are deterministic.`
                : 'Add and commit a lockfile for your package manager so dependency resolution is deterministic.',
              'high',
            ),
          );
        }
        if (has('runtime.pinned')) {
          items.push(
            remediation(
              'reproducibility',
              'Pin the runtime version',
              runtimeHint(repo),
              'low',
            ),
          );
        }
        if (has('containerization') && s < 45) {
          items.push(
            remediation(
              'reproducibility',
              'Consider adding a dev container or Dockerfile',
              'A Dockerfile or .devcontainer/ gives contributors and CI an identical environment. Optional, but it removes a whole class of "works on my machine" problems.',
              'low',
            ),
          );
        }
        return items;
      },
    );
  },
};

interface SetupText {
  headings: string;
  body: string;
  source: string;
}

async function gatherSetupText(tree: RepoTree): Promise<SetupText> {
  const headings: string[] = [];
  const bodies: string[] = [];
  const sources: string[] = [];
  for (const name of SETUP_DOC_NAMES) {
    const found = tree.files.includes(name) ? name : findRootFile(tree, basename(name));
    if (!found) {
      continue;
    }
    const content = await readFileSafe(tree.root, found);
    if (!content) {
      continue;
    }
    sources.push(found);
    for (const line of content.split(/\r?\n/)) {
      const m = /^\s{0,3}#{1,6}\s+(.+)$/.exec(line);
      if (m) {
        headings.push(m[1]);
      }
    }
    bodies.push(content);
  }
  return { headings: headings.join('\n'), body: bodies.join('\n'), source: sources.join(', ') || '(none)' };
}

interface Pinning {
  assessable: boolean;
  score: number;
  detail: string;
}

function analyzePinning(pkg: Awaited<ReturnType<typeof readPackageJson>>, requirements: string | undefined): Pinning {
  const buckets = { exact: 0, range: 0, loose: 0 };

  if (pkg) {
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const spec of Object.values(deps)) {
      classifyNpmSpec(String(spec), buckets);
    }
  }
  if (requirements) {
    for (const raw of requirements.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('-')) {
        continue;
      }
      if (/==\s*[\w.]+/.test(line)) {
        buckets.exact++;
      } else if (/[<>~!]=/.test(line)) {
        buckets.range++;
      } else {
        buckets.loose++;
      }
    }
  }

  const total = buckets.exact + buckets.range + buckets.loose;
  if (total === 0) {
    return { assessable: false, score: 0, detail: 'no npm/pip manifest dependencies to assess' };
  }
  // Exact pins score full; caret/tilde ranges are acceptable; loose specs score 0.
  const score = (buckets.exact + 0.7 * buckets.range) / total;
  return {
    assessable: true,
    score,
    detail: `${total} dep(s): ${buckets.exact} exact, ${buckets.range} ranged, ${buckets.loose} unbounded (${pct(score)} constrained)`,
  };
}

function classifyNpmSpec(spec: string, buckets: { exact: number; range: number; loose: number }): void {
  const s = spec.trim();
  if (s === '' || s === '*' || s === 'latest' || s === 'x' || /^https?:|^git\+|^github:|^file:/.test(s)) {
    buckets.loose++;
  } else if (/^\d+\.\d+\.\d+([-+].+)?$/.test(s)) {
    buckets.exact++;
  } else if (/^[~^]|\s-\s|\|\||>=|<=|>|</.test(s) || /\.x$/.test(s)) {
    buckets.range++;
  } else {
    buckets.range++;
  }
}

function detectManifests(tree: RepoTree): string[] {
  const out = new Set<string>();
  for (const f of tree.files) {
    const b = basename(f).toLowerCase();
    if (b === 'package.json') {
      out.add('npm');
    } else if (b === 'pyproject.toml' || b === 'requirements.txt' || b === 'pipfile' || b === 'setup.py') {
      out.add('Python');
    } else if (b === 'go.mod') {
      out.add('Go modules');
    } else if (b === 'cargo.toml') {
      out.add('Cargo');
    } else if (b === 'composer.json') {
      out.add('Composer');
    } else if (b === 'gemfile') {
      out.add('Bundler');
    }
  }
  return [...out];
}

function exampleCommands(repo: ReturnType<typeof classifyRepo>): string {
  switch (repo.primaryLanguage) {
    case 'py':
      return '`pip install -e .`, `pytest`';
    case 'go':
      return '`go build ./...`, `go test ./...`';
    case 'rust':
      return '`cargo build`, `cargo test`';
    default:
      return '`npm ci`, `npm test`, `npm start`';
  }
}

function runtimeHint(repo: ReturnType<typeof classifyRepo>): string {
  switch (repo.primaryLanguage) {
    case 'py':
      return 'Add a `.python-version` file (pyenv) or a `requires-python` constraint in pyproject.toml.';
    case 'go':
      return 'Add a `go 1.xx` directive to go.mod.';
    case 'rust':
      return 'Add a `rust-toolchain.toml` pinning the channel.';
    default:
      return 'Add an `engines.node` field to package.json and a `.nvmrc` so the Node version is explicit.';
  }
}
