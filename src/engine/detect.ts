/**
 * Shared repo-feature detectors. Kept in one place because several dimensions
 * ask overlapping questions (Verifiability and Change safety both want CI;
 * Reproducibility and Change safety both want lockfiles, etc.).
 *
 * Every detector is a pure function over the pre-built {@link RepoTree} plus,
 * where useful, already-parsed `package.json`. No `vscode`, no disk walking.
 */

import { readFileSafe } from './fsUtils';
import { basename, stripJsonComments } from './source';
import type { RepoTree } from './types';

export interface Detection {
  found: boolean;
  /** Repo-relative paths that triggered the detection. */
  evidence: string[];
  /** Human-readable tool/provider names. */
  names: string[];
}

const empty = (): Detection => ({ found: false, evidence: [], names: [] });

/** Path depth (number of segments). `CODEOWNERS` = 1, `.github/CODEOWNERS` = 2. */
function depth(p: string): number {
  return p.split('/').length;
}

function add(d: Detection, evidence: string, name?: string): void {
  d.found = true;
  d.evidence.push(evidence);
  if (name && !d.names.includes(name)) {
    d.names.push(name);
  }
}

/** CI / build-pipeline configuration, host-agnostic. */
export function detectCI(tree: RepoTree): Detection {
  const d = empty();
  for (const f of tree.files) {
    if (depth(f) > 4) {
      continue;
    }
    const b = basename(f).toLowerCase();
    if (/^\.github\/workflows\/.+\.ya?ml$/.test(f)) {
      add(d, f, 'GitHub Actions');
    } else if (b === '.gitlab-ci.yml') {
      add(d, f, 'GitLab CI');
    } else if (b === 'azure-pipelines.yml' || /^\.az(ure)?-pipelines\//.test(f) || /^\.azuredevops\//.test(f)) {
      add(d, f, 'Azure Pipelines');
    } else if (b === 'bitbucket-pipelines.yml') {
      add(d, f, 'Bitbucket Pipelines');
    } else if (/^\.circleci\/config\.ya?ml$/.test(f)) {
      add(d, f, 'CircleCI');
    } else if (b === 'jenkinsfile') {
      add(d, f, 'Jenkins');
    } else if (b === '.drone.yml') {
      add(d, f, 'Drone');
    } else if (b === '.travis.yml') {
      add(d, f, 'Travis CI');
    } else if (/^\.buildkite\/.+\.ya?ml$/.test(f)) {
      add(d, f, 'Buildkite');
    } else if (/^\.woodpecker(\.yml|\/.+\.ya?ml)$/.test(f)) {
      add(d, f, 'Woodpecker');
    } else if (b === 'cloudbuild.yaml' || b === 'cloudbuild.yml') {
      add(d, f, 'Google Cloud Build');
    } else if (/^\.teamcity\//.test(f)) {
      add(d, f, 'TeamCity');
    }
  }
  return d;
}

/** Linter / static-analysis configuration. `pkg` is a parsed package.json if available. */
export function detectLinters(tree: RepoTree, pkg?: PackageJson): Detection {
  const d = empty();
  for (const f of tree.files) {
    const b = basename(f).toLowerCase();
    if (/^\.eslintrc(\.(js|cjs|mjs|json|ya?ml))?$/.test(b) || /^eslint\.config\.[cm]?[jt]s$/.test(b)) {
      add(d, f, 'ESLint');
    } else if (b === 'biome.json' || b === 'biome.jsonc') {
      add(d, f, 'Biome');
    } else if (/^\.stylelintrc/.test(b)) {
      add(d, f, 'Stylelint');
    } else if (b === '.flake8' || b === '.pylintrc' || b === 'ruff.toml' || b === '.ruff.toml') {
      add(d, f, b.includes('ruff') ? 'Ruff' : b.includes('pylint') ? 'Pylint' : 'Flake8');
    } else if (b === '.rubocop.yml') {
      add(d, f, 'RuboCop');
    } else if (b === '.golangci.yml' || b === '.golangci.yaml' || b === '.golangci.toml') {
      add(d, f, 'golangci-lint');
    } else if (b === 'checkstyle.xml' || b === '.checkstyle') {
      add(d, f, 'Checkstyle');
    } else if (b === '.editorconfig') {
      add(d, f, 'EditorConfig');
    }
  }
  if (pkg?.eslintConfig) {
    add(d, 'package.json#eslintConfig', 'ESLint');
  }
  if (pkg?.devDependencies || pkg?.dependencies) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(deps)) {
      if (name === 'eslint') {
        add(d, `package.json:${name}`, 'ESLint');
      } else if (name === '@biomejs/biome') {
        add(d, `package.json:${name}`, 'Biome');
      } else if (name === 'oxlint') {
        add(d, `package.json:${name}`, 'oxlint');
      }
    }
  }
  return d;
}

/** Formatter config — weaker signal than a linter, tracked separately. */
export function detectFormatter(tree: RepoTree): Detection {
  const d = empty();
  for (const f of tree.files) {
    const b = basename(f).toLowerCase();
    if (/^\.prettierrc/.test(b) || b === 'prettier.config.js' || b === '.editorconfig') {
      add(d, f, b.includes('prettier') ? 'Prettier' : 'EditorConfig');
    }
  }
  return d;
}

/** Package-manager lockfiles, across ecosystems. */
export function detectLockfiles(tree: RepoTree): Detection {
  const d = empty();
  const known: Record<string, string> = {
    'package-lock.json': 'npm',
    'npm-shrinkwrap.json': 'npm',
    'yarn.lock': 'Yarn',
    'pnpm-lock.yaml': 'pnpm',
    'bun.lockb': 'Bun',
    'bun.lock': 'Bun',
    'poetry.lock': 'Poetry',
    'pdm.lock': 'PDM',
    'uv.lock': 'uv',
    'pipfile.lock': 'Pipenv',
    'cargo.lock': 'Cargo',
    'go.sum': 'Go modules',
    'composer.lock': 'Composer',
    'gemfile.lock': 'Bundler',
    'flake.lock': 'Nix',
    'packages.lock.json': 'NuGet',
  };
  for (const f of tree.files) {
    const b = basename(f).toLowerCase();
    if (known[b]) {
      add(d, f, known[b]);
    }
  }
  return d;
}

/** Containerization / dev-environment reproducibility. */
export function detectContainerization(tree: RepoTree): Detection {
  const d = empty();
  for (const f of tree.files) {
    const b = basename(f).toLowerCase();
    if (b === 'dockerfile' || /\.dockerfile$/.test(b) || /^dockerfile\./.test(b)) {
      add(d, f, 'Dockerfile');
    } else if (b === 'docker-compose.yml' || b === 'docker-compose.yaml' || b === 'compose.yml' || b === 'compose.yaml') {
      add(d, f, 'Docker Compose');
    } else if (/^\.devcontainer\/.*devcontainer\.json$/.test(f) || b === '.devcontainer.json') {
      add(d, f, 'Dev Container');
    } else if (b === 'flake.nix' || b === 'shell.nix' || b === 'default.nix') {
      add(d, f, 'Nix');
    } else if (b === 'vagrantfile') {
      add(d, f, 'Vagrant');
    } else if (b === '.tool-versions') {
      add(d, f, 'asdf');
    }
  }
  return d;
}

/** Changelog / release-notes discipline. */
export function detectChangelog(tree: RepoTree): Detection {
  const d = empty();
  for (const f of tree.files) {
    if (depth(f) > 3) {
      continue; // a CHANGELOG buried deep is a vendored/fixture copy, not the project's
    }
    const b = basename(f).toLowerCase();
    if (/^(changelog|changes|history|release[-_]?notes|news)(\.(md|rst|txt|adoc))?$/.test(b)) {
      add(d, f, b);
    }
    if (/^\.changeset\/config\.json$/.test(f)) {
      add(d, f, 'Changesets');
    }
    if (b === '.release-please-manifest.json' || b === 'release-please-config.json') {
      add(d, f, 'release-please');
    }
  }
  return d;
}

/** Pinned language runtime / toolchain version. */
export function detectRuntimePin(tree: RepoTree, pkg?: PackageJson): Detection {
  const d = empty();
  for (const f of tree.files) {
    const b = basename(f).toLowerCase();
    if (b === '.nvmrc' || b === '.node-version') {
      add(d, f, 'Node');
    } else if (b === '.python-version' || b === 'runtime.txt') {
      add(d, f, 'Python');
    } else if (b === '.ruby-version') {
      add(d, f, 'Ruby');
    } else if (b === 'rust-toolchain' || b === 'rust-toolchain.toml') {
      add(d, f, 'Rust');
    } else if (b === '.tool-versions') {
      add(d, f, 'asdf');
    } else if (b === '.sdkmanrc') {
      add(d, f, 'SDKMAN');
    }
  }
  if (pkg?.engines && Object.keys(pkg.engines).length > 0) {
    add(d, 'package.json#engines', 'Node/npm engines');
  }
  if (pkg && (pkg as { volta?: unknown }).volta) {
    add(d, 'package.json#volta', 'Volta');
  }
  return d;
}

/** Pre-commit / pre-push hook frameworks (a local proxy for enforced checks). */
export function detectGitHooks(tree: RepoTree, pkg?: PackageJson): Detection {
  const d = empty();
  for (const f of tree.files) {
    const b = basename(f).toLowerCase();
    if (/^\.husky\//.test(f) && b !== '.gitignore') {
      add(d, f, 'Husky');
    } else if (b === '.pre-commit-config.yaml' || b === '.pre-commit-config.yml') {
      add(d, f, 'pre-commit');
    } else if (b === 'lefthook.yml' || b === 'lefthook.yaml' || b === '.lefthook.yml') {
      add(d, f, 'Lefthook');
    } else if (/^\.githooks\//.test(f)) {
      add(d, f, 'core.hooksPath');
    }
  }
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  if (deps['husky']) {
    add(d, 'package.json:husky', 'Husky');
  }
  if (deps['simple-git-hooks'] || (pkg as { 'simple-git-hooks'?: unknown })?.['simple-git-hooks']) {
    add(d, 'package.json:simple-git-hooks', 'simple-git-hooks');
  }
  if ((pkg as { 'lint-staged'?: unknown })?.['lint-staged'] || deps['lint-staged']) {
    add(d, 'package.json:lint-staged', 'lint-staged');
  }
  return d;
}

/** Code ownership / review-gate configuration that is visible in the repo. */
export function detectCodeowners(tree: RepoTree): Detection {
  const d = empty();
  for (const f of tree.files) {
    if (depth(f) > 3) {
      continue;
    }
    const b = basename(f).toLowerCase();
    if (b === 'codeowners') {
      add(d, f, 'CODEOWNERS');
    } else if (b === '.github/settings.yml' || f.toLowerCase() === '.github/settings.yml') {
      add(d, f, 'Probot settings');
    } else if (/^\.github\/rulesets?\/.+\.json$/i.test(f)) {
      add(d, f, 'GitHub ruleset');
    } else if (b === '.gitlab' || /^\.gitlab\/.*push.?rules/i.test(f)) {
      add(d, f, 'GitLab push rules');
    }
  }
  return d;
}

/** Pull/merge-request template. */
export function detectPRTemplate(tree: RepoTree): Detection {
  const d = empty();
  for (const f of tree.files) {
    if (depth(f) > 4) {
      continue;
    }
    const lower = f.toLowerCase();
    if (
      /(^|\/)(pull_request_template|pull_request_template\.md)$/i.test(lower) ||
      /(^|\/)\.github\/pull_request_template(\.md)?$/i.test(lower) ||
      /(^|\/)\.github\/pull_request_template\/.+/i.test(lower) ||
      /(^|\/)docs\/pull_request_template\.md$/i.test(lower) ||
      /(^|\/)\.gitlab\/merge_request_templates\/.+/i.test(lower)
    ) {
      add(d, f, basename(f));
    }
  }
  return d;
}

export interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  eslintConfig?: unknown;
  engines?: Record<string, string>;
  [k: string]: unknown;
}

export async function readPackageJson(tree: RepoTree): Promise<PackageJson | undefined> {
  const p = tree.files.find((f) => f === 'package.json');
  if (!p) {
    return undefined;
  }
  const raw = await readFileSafe(tree.root, p);
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(stripJsonComments(raw)) as PackageJson;
  } catch {
    return undefined;
  }
}
