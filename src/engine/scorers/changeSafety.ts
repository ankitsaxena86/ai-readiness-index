/**
 * Change safety — if someone changes this repo, what stops a regression from
 * shipping? Regression-catching tests, CI wired to run on pull/merge requests,
 * any locally visible review gate (CODEOWNERS, rulesets, enforced hooks), a
 * maintained changelog, and a PR template that asks the right questions.
 *
 * "Branch protection" itself lives on the hosting provider; we detect only the
 * in-repo artifacts that imply it, and never contact an API.
 */

import { readFileSafe } from '../fsUtils';
import {
  detectCI,
  detectChangelog,
  detectCodeowners,
  detectGitHooks,
  detectPRTemplate,
  readPackageJson,
} from '../detect';
import { classifyRepo } from '../source';
import { priorityFor } from '../weights';
import type { DimensionScorer, RepoTree, ScanContext, Signal } from '../types';
import { finalize, remediation, signal } from './util';

const PR_TRIGGER_RE = /\b(pull_request|pull_request_target|merge_request|merge_group)\b|on:\s*\[?[^\]]*\bpr\b/i;
const ASSERTION_RE = /\b(expect|assert|should|t\.(is|deepEqual|truthy)|assertEquals|require\.that)\b|\btoBe|\btoEqual|\bassertThat/;

export const changeSafetyScorer: DimensionScorer = {
  id: 'changeSafety',
  async score(ctx: ScanContext) {
    const { tree } = ctx;
    const repo = classifyRepo(tree);
    const pkg = await readPackageJson(tree);

    // --- Regression tests ---
    const ratio = repo.test.length / Math.max(1, repo.source.length);
    let assertionFiles = 0;
    for (const t of repo.test.slice(0, 40)) {
      const content = await readFileSafe(tree.root, t.path);
      if (content && ASSERTION_RE.test(content)) {
        assertionFiles++;
      }
    }
    const hasRealAssertions = assertionFiles > 0;
    const regressionStatus =
      repo.test.length > 0 && hasRealAssertions && ratio >= 0.3
        ? 'met'
        : repo.test.length > 0 && hasRealAssertions
          ? 'partial'
          : 'missing';

    // --- CI on PRs ---
    const ci = detectCI(tree);
    let ciOnPr = false;
    for (const f of ci.evidence) {
      const content = await readFileSafe(tree.root, f);
      if (content && PR_TRIGGER_RE.test(content)) {
        ciOnPr = true;
        break;
      }
    }

    // --- Local review-gate artifacts ---
    const codeowners = detectCodeowners(tree);
    const hooks = detectGitHooks(tree, pkg);
    const gateStatus = codeowners.found ? 'met' : hooks.found ? 'partial' : 'missing';

    // --- Changelog discipline ---
    const changelog = detectChangelog(tree);
    const changelogQuality = await assessChangelog(tree, changelog.evidence[0]);

    // --- PR template ---
    const prTemplate = detectPRTemplate(tree);

    const signals: Signal[] = [];

    signals.push(
      signal({
        id: 'change.regressionTests',
        label: 'Tests exist that would fail on a regression',
        weight: 30,
        status: regressionStatus,
        detail:
          repo.test.length === 0
            ? 'no test files'
            : `${assertionFiles}/${Math.min(repo.test.length, 40)} sampled test files contain assertions; test/source ratio ${ratio.toFixed(2)}`,
        earned: 30 * (regressionStatus === 'met' ? 1 : regressionStatus === 'partial' ? 0.55 : 0),
      }),
    );

    signals.push(
      signal({
        id: 'change.ciOnPr',
        label: 'CI runs automatically on pull / merge requests',
        weight: 20,
        status: ciOnPr ? 'met' : ci.found ? 'partial' : 'missing',
        detail: ciOnPr
          ? `${ci.names.join(', ')} triggers on PR/MR events`
          : ci.found
            ? `${ci.names.join(', ')} is configured but no PR/MR trigger was found`
            : 'no CI configuration',
      }),
    );

    signals.push(
      signal({
        id: 'change.reviewGate',
        label: 'A review gate is configured in-repo',
        weight: 15,
        status: gateStatus,
        detail: codeowners.found
          ? `${codeowners.names.join(', ')} (${codeowners.evidence[0]})`
          : hooks.found
            ? `enforced hooks only: ${hooks.names.join(', ')}`
            : 'no CODEOWNERS, ruleset, or enforced hooks',
      }),
    );

    signals.push(
      signal({
        id: 'change.changelog',
        label: 'Changelog discipline',
        weight: 20,
        status: changelogQuality.status,
        detail: changelogQuality.detail,
        earned: 20 * changelogQuality.credit,
      }),
    );

    signals.push(
      signal({
        id: 'change.prTemplate',
        label: 'A PR / MR template guides contributors',
        weight: 15,
        status: prTemplate.found ? 'met' : 'missing',
        detail: prTemplate.found ? prTemplate.evidence[0] : 'no pull/merge request template',
      }),
    );

    return finalize(
      'changeSafety',
      signals,
      ctx,
      (s) =>
        s >= 80
          ? 'Strong guardrails: regressions are caught by tests and CI before merge, and changes are tracked.'
          : s >= 50
            ? 'Some guardrails, but a careless change could still land unnoticed.'
            : 'Few guardrails against regressions — changes are largely unchecked.',
      (weak, s) => {
        const prio = priorityFor(s, ctx.remediationThreshold);
        const items = [];
        const has = (id: string) => weak.some((w) => w.id === id);

        if (has('change.regressionTests')) {
          items.push(
            remediation(
              'changeSafety',
              repo.test.length === 0 ? 'Add regression tests' : 'Strengthen the regression test suite',
              repo.test.length === 0
                ? `There are no tests. Add tests with real assertions for the core logic paths first — start with ${suggestRunner(repo)}.`
                : `Only ${assertionFiles} sampled test file(s) contain assertions and the test/source ratio is ${ratio.toFixed(2)}. Add assertion-heavy tests for the modules most likely to break.`,
              'high',
            ),
          );
        }
        if (has('change.ciOnPr')) {
          items.push(
            remediation(
              'changeSafety',
              'Run CI on pull / merge requests',
              ci.found
                ? 'CI exists but no PR/MR trigger was detected. Add `pull_request:` (GitHub), `merge_request` rules (GitLab), or a PR trigger (Azure/Bitbucket) so checks run before merge, not only after.'
                : 'Add a CI pipeline and trigger it on pull/merge requests so every proposed change is tested before it lands.',
              'high',
            ),
          );
        }
        if (has('change.reviewGate')) {
          items.push(
            remediation(
              'changeSafety',
              'Add a code-review gate',
              'Add a CODEOWNERS file so changes to key paths require a named reviewer. If you manage settings-as-code, commit the branch ruleset too. As a local backstop, add a pre-push hook (Husky / pre-commit / Lefthook) that runs tests.',
              prio,
            ),
          );
        }
        if (has('change.changelog')) {
          items.push(
            remediation(
              'changeSafety',
              changelogQuality.credit === 0 ? 'Start a CHANGELOG.md' : 'Keep the changelog current',
              changelogQuality.credit === 0
                ? 'Add CHANGELOG.md in Keep a Changelog format with an [Unreleased] section contributors append to, or adopt Changesets / release-please to generate it.'
                : 'The changelog exists but looks stale or has only one entry. Record user-facing changes under [Unreleased] as part of each PR.',
              'low',
            ),
          );
        }
        if (has('change.prTemplate')) {
          items.push(
            remediation(
              'changeSafety',
              'Add a PR template',
              'Add .github/pull_request_template.md (or .gitlab/merge_request_templates/) with a checklist: tests added, changelog updated, docs updated, breaking changes noted. It makes the discipline automatic.',
              'low',
            ),
          );
        }
        return items;
      },
    );
  },
};

interface ChangelogAssessment {
  status: Signal['status'];
  credit: number;
  detail: string;
}

async function assessChangelog(tree: RepoTree, evidencePath: string | undefined): Promise<ChangelogAssessment> {
  const releaseAutomation = tree.files.some(
    (f) => /(^|\/)\.changeset\/config\.json$/.test(f) || /release-please/.test(f),
  );
  if (!evidencePath && releaseAutomation) {
    return { status: 'met', credit: 0.9, detail: 'release automation configured (generates the changelog)' };
  }
  if (!evidencePath) {
    return { status: 'missing', credit: 0, detail: 'no CHANGELOG / HISTORY file' };
  }
  const content = (await readFileSafe(tree.root, evidencePath)) ?? '';
  const versionHeadings = (content.match(/^##?\s*\[?v?\d+\.\d+\.\d+/gim) ?? []).length;
  const hasUnreleased = /unreleased/i.test(content);
  const keepAChangelog = /keepachangelog\.com/i.test(content) || /^###\s+(added|changed|fixed|removed)/im.test(content);

  if (versionHeadings >= 2 || (versionHeadings >= 1 && hasUnreleased)) {
    return {
      status: 'met',
      credit: keepAChangelog ? 1 : 0.85,
      detail: `${evidencePath}: ${versionHeadings} version entr${versionHeadings === 1 ? 'y' : 'ies'}${hasUnreleased ? ' + [Unreleased]' : ''}${keepAChangelog ? ', Keep a Changelog format' : ''}`,
    };
  }
  return {
    status: 'partial',
    credit: 0.4,
    detail: `${evidencePath} exists but looks thin (${versionHeadings} version entr${versionHeadings === 1 ? 'y' : 'ies'})`,
  };
}

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
