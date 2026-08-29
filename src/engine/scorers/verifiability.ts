/**
 * Verifiability — can changes to this repo be checked automatically? Looks for
 * tests (and their coverage relative to the source), CI configuration, and
 * linting. All local filesystem heuristics; CI is recognized by config-file
 * shape, never by contacting a provider.
 */

import { detectCI, detectFormatter, detectLinters, readPackageJson } from '../detect';
import { classifyRepo } from '../source';
import { priorityFor } from '../weights';
import type { DimensionScorer, ScanContext, Signal } from '../types';
import { finalize, remediation, signal } from './util';

const TEST_FRAMEWORK_CONFIG =
  /^(jest|vitest|mocha|ava|karma|playwright|cypress|jasmine)\.config\.|^(pytest\.ini|tox\.ini|\.mocharc|phpunit\.xml|\.rspec)$/i;

const REAL_TEST_SCRIPT = /(vitest|jest|mocha|ava|playwright|cypress|pytest|tox|go test|cargo test|rspec|phpunit|node --test|tap\b)/i;
const PLACEHOLDER_TEST_SCRIPT = /no test specified/i;

export const verifiabilityScorer: DimensionScorer = {
  id: 'verifiability',
  async score(ctx: ScanContext) {
    const { tree } = ctx;
    const repo = classifyRepo(tree);
    const pkg = await readPackageJson(tree);

    const testFiles = repo.test;
    const sourceCount = Math.max(1, repo.source.length);
    const ratio = testFiles.length / sourceCount;

    const hasFrameworkConfig = tree.files.some((f) => TEST_FRAMEWORK_CONFIG.test(f.slice(f.lastIndexOf('/') + 1)));

    const ci = detectCI(tree);
    const linters = detectLinters(tree, pkg);
    const formatter = detectFormatter(tree);

    const testScript = pkg?.scripts?.test;
    const hasRealTestScript =
      (!!testScript && REAL_TEST_SCRIPT.test(testScript) && !PLACEHOLDER_TEST_SCRIPT.test(testScript)) ||
      hasFrameworkConfig ||
      tree.files.some((f) => /(^|\/)(tox\.ini|noxfile\.py|Makefile)$/i.test(f));

    const signals: Signal[] = [];

    signals.push(
      signal({
        id: 'tests.present',
        label: 'Automated tests exist',
        weight: 22,
        status: testFiles.length > 0 ? 'met' : hasFrameworkConfig ? 'partial' : 'missing',
        detail:
          testFiles.length > 0
            ? `${testFiles.length} test file(s)`
            : hasFrameworkConfig
              ? 'test framework configured but no test files found'
              : 'no test files detected',
      }),
    );

    signals.push(
      signal({
        id: 'tests.ratio',
        label: 'Test coverage is proportional to the codebase',
        weight: 24,
        status: ratio >= 0.4 ? 'met' : ratio >= 0.15 ? 'partial' : 'missing',
        detail: `${testFiles.length} test / ${repo.source.length} source file(s) (ratio ${ratio.toFixed(2)})`,
        earned: 24 * clamp01(ratio / 0.5),
      }),
    );

    signals.push(
      signal({
        id: 'ci.config',
        label: 'Continuous integration is configured',
        weight: 26,
        status: ci.found ? 'met' : 'missing',
        detail: ci.found ? `${ci.names.join(', ')} (${ci.evidence[0]})` : 'no CI pipeline config found',
      }),
    );

    signals.push(
      signal({
        id: 'lint.config',
        label: 'A linter is configured',
        weight: 16,
        status: linters.found ? 'met' : formatter.found ? 'partial' : 'missing',
        detail: linters.found
          ? linters.names.join(', ')
          : formatter.found
            ? `only a formatter (${formatter.names.join(', ')})`
            : 'no linter or formatter config',
      }),
    );

    signals.push(
      signal({
        id: 'test.script',
        label: 'Tests are runnable with one documented command',
        weight: 12,
        status: hasRealTestScript ? 'met' : 'missing',
        detail: hasRealTestScript
          ? testScript
            ? `"test": "${testScript}"`
            : 'test runner config present'
          : testScript
            ? `placeholder script: "${testScript}"`
            : 'no test script / target',
      }),
    );

    return finalize(
      'verifiability',
      signals,
      ctx,
      (s) =>
        s >= 80
          ? 'Changes are well guarded: tests plus CI catch regressions automatically.'
          : s >= 50
            ? 'Partial safety net — some automated checking, with gaps.'
            : 'Little automated verification; regressions would slip through.',
      (weak, s) => {
        const prio = priorityFor(s, ctx.remediationThreshold);
        const items = [];
        const has = (id: string) => weak.some((w) => w.id === id);

        if (has('tests.present')) {
          items.push(
            remediation(
              'verifiability',
              'Add a test suite',
              `No test files were found among ${repo.source.length} source file(s). Add a runner (${suggestRunner(repo)}) and cover the most-used module first.`,
              'high',
            ),
          );
        } else if (has('tests.ratio')) {
          items.push(
            remediation(
              'verifiability',
              'Raise the test-to-source ratio',
              `Currently ${testFiles.length} test file(s) for ${repo.source.length} source file(s). Target at least ~1 test file per 2 source files; prioritize modules with branching logic.`,
              prio,
            ),
          );
        }
        if (has('ci.config')) {
          items.push(
            remediation(
              'verifiability',
              'Add a CI pipeline',
              `Create a pipeline config (e.g. .github/workflows/ci.yml, .gitlab-ci.yml, or azure-pipelines.yml) that runs ${
                has('test.script') ? 'the build, ' : ''
              }the test suite and the linter on every push and pull request.`,
              'high',
            ),
          );
        }
        if (has('lint.config')) {
          items.push(
            remediation(
              'verifiability',
              'Configure a linter',
              formatterOnlyHint(formatter.found, repo),
              prio,
            ),
          );
        }
        if (has('test.script')) {
          items.push(
            remediation(
              'verifiability',
              'Expose a single test command',
              'Add a real `test` script to package.json (or a `test` target to the Makefile / a tox env) so contributors and CI run tests the same way. Document it in the README.',
              'medium',
            ),
          );
        }
        return items;
      },
    );
  },
};

function suggestRunner(repo: ReturnType<typeof classifyRepo>): string {
  switch (repo.primaryLanguage) {
    case 'py':
      return 'pytest';
    case 'go':
      return 'go test';
    case 'rust':
      return 'cargo test';
    case 'java':
      return 'JUnit';
    case 'ruby':
      return 'RSpec';
    default:
      return 'Vitest or Jest';
  }
}

function formatterOnlyHint(hasFormatter: boolean, repo: ReturnType<typeof classifyRepo>): string {
  const tool =
    repo.primaryLanguage === 'py'
      ? 'Ruff or flake8'
      : repo.primaryLanguage === 'go'
        ? 'golangci-lint'
        : repo.primaryLanguage === 'rust'
          ? 'clippy'
          : 'ESLint or Biome';
  return hasFormatter
    ? `A formatter is configured but a formatter does not catch bugs. Add ${tool} with a checked-in config and wire it into CI.`
    : `Add ${tool} with a checked-in config so style and common mistakes are enforced consistently.`;
}

function clamp01(n: number): number {
  return Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n));
}
