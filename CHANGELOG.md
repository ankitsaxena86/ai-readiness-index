# Changelog

All notable changes to the **AI-Readiness Index** extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-29

Initial release.

### Added

- **Scoring engine** — a modular engine (`src/engine/`, no `vscode` dependency)
  where each of the six dimensions is a `DimensionScorer` producing a 0–100
  score, explainable per-signal breakdown, and dimension-specific remediation:
  - **Context** — README presence/depth/sections/examples, architecture docs,
    comment density, type coverage (TS `strict`, Python annotation density,
    JS JSDoc / `@ts-check`).
  - **Verifiability** — test presence, test-to-source ratio, CI config
    (host-agnostic), linter config, a real one-command test entry point.
  - **Reproducibility** — setup/build/run instructions, dependency pinning,
    committed lockfile matching a manifest, pinned runtime, containerization
    (bonus).
  - **Documentation** — CONTRIBUTING, a `docs/` tree, ADRs, API/reference docs
    or a doc generator, doc-comment coverage on public definitions, supporting
    docs (CHANGELOG / SECURITY / examples).
  - **Navigability** — dedicated source root vs flat dump, file-naming
    consistency, purpose-named module grouping, discoverable entry point,
    directory depth, dumping-ground folders.
  - **Change safety** — regression-catching tests (with assertions), CI parsed
    for pull/merge-request triggers, in-repo review gates (CODEOWNERS, rulesets,
    enforced hooks), changelog quality, PR/MR template.
- **Weighting** — Copilot-tuned defaults (25 / 20 / 15 / 15 / 15 / 10),
  configurable and normalized so only ratios matter; degenerate all-zero config
  falls back to equal weighting.
- **Remediation matrix** — flattened, priority-sorted, dimension-gated at the
  configurable threshold (default 70).
- **Commands** — `AI-Readiness Index: Scan Repository`,
  `AI-Readiness Index: Show Last Results`.
- **Results panel** — overall score + grade, expandable per-dimension breakdown
  with individual signals, remediation checklist with persistent ticks,
  "Copy as Markdown".
- **Status bar item** showing the last scan's score (toggle: `ari.showStatusBarItem`).
- **`@ari` chat participant** — `/scan`, `/fixes`, `/explain <dimension>`;
  freeform questions answered by the user's language model grounded in the scan
  report, with a no-model fallback.
- **Background scan on workspace open** (`ari.scanOnStartup`) and automatic
  re-scan on relevant settings changes (`ari.rescanOnConfigChange`).
- **Settings** — dimension weights, `ari.remediationThreshold`, `ari.exclude`
  (with `**/.git/**` always excluded), `ari.maxFiles`, and the toggles above.
- Works on any local repository regardless of hosting (GitHub, GitLab,
  Bitbucket, Azure Repos, or no remote). No network calls; nothing leaves the
  machine.
