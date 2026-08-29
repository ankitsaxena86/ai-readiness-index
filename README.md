# AI-Readiness Index (ARI)

[![CI](https://github.com/ankitsaxena86/ai-readiness-index/actions/workflows/ci.yml/badge.svg)](https://github.com/ankitsaxena86/ai-readiness-index/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

**Score any repository on how ready it is for an AI coding assistant — 0 to 100, with a checklist of exactly what to fix.**

AI-Readiness Index scans your **local** repository and rates it across six
weighted dimensions of AI-assistant readiness. It works on any repo regardless
of where it's hosted — GitHub, GitLab, Bitbucket, Azure Repos, or a purely local
folder with no remote at all. Every check is a local filesystem heuristic; the
extension never calls a git hosting API and never sends your code anywhere.

## Why

An AI assistant — GitHub Copilot, and others — is only as good as the context the
repository gives it. Missing setup docs, no tests, an unnavigable folder layout,
or thin documentation all quietly degrade suggestions. ARI makes that readiness
measurable and hands you a concrete, prioritized remediation list instead of
vague advice.

## What it does

- Runs a **single command** (`AI-Readiness Index: Scan Repository`) over the open folder.
- Produces an **overall 0–100 score** and a letter grade.
- Shows a **per-dimension breakdown** — expand any dimension to see the individual
  signals that made up its score (✅ met / 🟡 partial / ❌ missing, with points).
- Generates a **remediation matrix**: for every dimension below your threshold, a
  specific, actionable suggestion tied to what was actually found (or missing).
  Tick items off — progress is remembered.
- **Copy as Markdown** — drop the whole report into an issue, a PR description, or
  a chat with your assistant.
- Optionally shows the last score in the **status bar** and re-scans on workspace open.

## `@ari` in Chat

If you have a chat provider (e.g. GitHub Copilot Chat), ARI registers a chat
participant:

| Command | What it does |
|---|---|
| `@ari /scan` | Run a fresh scan and show the summary + top fixes |
| `@ari /fixes` | The full remediation checklist, grouped by priority |
| `@ari /explain documentation` | Break down one dimension's score and its fixes |
| `@ari why is my score low?` | Answered by your language model, grounded **only** in the scan report (falls back to the raw breakdown if no model is available) |

The extension works fully without a chat provider — the participant is just an
extra surface.

## The six dimensions

| Dimension | Default weight | What it measures |
|---|---:|---|
| **Context** | 25% | How well the repo surrounds an assistant with usable context: README depth, inline comments, type coverage, architecture docs. |
| **Verifiability** | 20% | Presence and coverage of tests, CI configuration, and linting rules. |
| **Reproducibility** | 15% | Clear setup/build/run instructions, pinned dependencies, working lockfiles, containerization if present. |
| **Documentation** | 15% | Docs beyond the README: API/reference docs, ADRs, doc comments on public definitions, `CONTRIBUTING.md`. |
| **Navigability** | 15% | Folder/module structure clarity, naming conventions, and consistent patterns a coding assistant can infer from. |
| **Change safety** | 10% | Tests that would catch regressions, CI wired to run on pull/merge requests, locally visible review gates (CODEOWNERS, enforced hooks), and changelog discipline. |

Weights are **fully configurable** in settings — only their ratios matter, they're
normalized before scoring.

## Install & usage

1. Install **AI-Readiness Index** from the VS Code Marketplace.
2. Open a project folder.
3. Run **`AI-Readiness Index: Scan Repository`** from the Command Palette
   (`Ctrl+Shift+P` / `Cmd+Shift+P`).
4. Review the score, breakdown, and remediation checklist in the results panel.
5. Fix items, re-scan, watch the score climb.

The status bar item (bottom right) shows your latest score; click it to reopen the panel.

## Settings

| Setting | Default | Description |
|---|---|---|
| `ari.weights.context` | `25` | Relative weight of the Context dimension. |
| `ari.weights.verifiability` | `20` | Relative weight of Verifiability. |
| `ari.weights.reproducibility` | `15` | Relative weight of Reproducibility. |
| `ari.weights.documentation` | `15` | Relative weight of Documentation. |
| `ari.weights.navigability` | `15` | Relative weight of Navigability. |
| `ari.weights.changeSafety` | `10` | Relative weight of Change safety. |
| `ari.remediationThreshold` | `70` | Dimensions scoring below this (0–100) generate remediation items. |
| `ari.exclude` | *(common build/vendor dirs)* | Glob patterns excluded from scanning. `**/.git/**` is always excluded. |
| `ari.maxFiles` | `20000` | Stop walking after this many files (protects against huge repos). |
| `ari.scanOnStartup` | `true` | Run a lightweight background scan when a workspace opens. |
| `ari.rescanOnConfigChange` | `true` | Re-scan automatically when weights / threshold / excludes change. |
| `ari.showStatusBarItem` | `true` | Show the last scan's score in the status bar. |

## Works on any repository, regardless of hosting

ARI performs **only local filesystem checks**. It recognizes CI config from
GitHub Actions, GitLab CI, Azure Pipelines, Bitbucket Pipelines, CircleCI,
Jenkins, Drone, Travis and others, but it never contacts any of them. A repo with
no `git remote` at all scores exactly the same as if it were pushed to GitHub.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md)
for how to build, test, and run the extension locally, plus a terminal-based way
to scan many repositories at once.

## License

[MIT](LICENSE)
