# Contributing to AI-Readiness Index

Thanks for your interest in improving ARI. This document covers building, testing,
and running the extension locally.

## Prerequisites

- Node.js 20 or newer
- VS Code 1.96 or newer (for the Extension Development Host)

## Setup

```bash
git clone <this repo>
cd ai-readiness-index
npm install
```

## Build

```bash
npm run watch        # esbuild bundle in watch mode (dist/extension.js)
npm run package      # one-off production bundle
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

## Run the extension

Press **F5** in VS Code to launch the Extension Development Host with the
extension loaded. Open any project folder in that window and run
**"AI-Readiness Index: Scan Repository"** from the Command Palette.

## Tests

```bash
npm run test:unit    # vitest — the pure scoring engine + HTML rendering
npm test             # @vscode/test-electron — host integration + a driver
```

- **Engine / logic tests** live next to their source as `*.vitest.test.ts` and
  must never import `vscode`.
- **Host tests** live in `src/test/*.test.ts` and run inside a real VS Code
  instance with `test/fixtures/ready-repo` opened as the workspace.
- `src/test/run.test.ts` is a driver that activates the extension, runs a scan,
  and writes reports to `drive-output/` — handy for eyeballing real output.

## Architecture

```
src/
├── extension.ts        entry point: commands, status bar, chat participant, scan-on-open
├── config.ts           VS Code settings -> plain engine options
├── engine/             ← never imports "vscode"; unit-tested in plain Node
│   ├── types.ts         DimensionScorer interface, Signal, RemediationItem, ScanResult
│   ├── fsUtils.ts       single-pass repo tree walk + glob matching
│   ├── source.ts        language classification, comment density, type coverage
│   ├── detect.ts        host-agnostic detectors (CI, linters, lockfiles, ...)
│   ├── weights.ts       weight normalization + score aggregation
│   ├── report.ts        ScanResult -> Markdown / summary line
│   ├── scanner.ts       orchestrator: tree -> all scorers -> weighted result
│   └── scorers/         one module per dimension, each a DimensionScorer
└── ui/
    ├── resultsHtml.ts   pure HTML rendering (testable, previewable)
    ├── resultsPanel.ts  webview lifecycle + message channel
    ├── chatParticipant.ts   the @ari participant
    └── statusBar.ts
```

Each dimension scorer implements `score(ctx): DimensionResult`, producing signals
(with `weight` / `earned` points), a summary, and dimension-specific remediation.
The scanner combines the six dimension scores using the normalized weights.

## Scanning many repositories from the terminal

Because the engine has no VS Code dependency, you can batch-scan repos without
opening any of them:

```bash
npm run scan -- ../service-a ../service-b ../service-c
npm run scan -- ~/code                 # every repo-looking folder under ~/code
npm run scan -- ../my-repo --md        # full Markdown report
npm run scan -- ../my-repo --json      # raw ScanResult
npm run scan -- ../my-repo --weights 30,20,15,15,15,5 --threshold 60
```

```
repo            score  grade    cont  veri  repr  docu  navi  chan
service-a          66  C          72    73    86    14    97    38
service-b          97  A          95   100   100    89    98   100
```

## Packaging

```bash
npx vsce package     # produces ai-readiness-index-<version>.vsix
```

## Pull requests

1. Open an issue describing the change first for anything non-trivial.
2. Add or update tests — every scorer has a fixture-based suite.
3. Run `npm run lint`, `npm run typecheck`, `npm run test:unit`, and `npm test`.
4. Update `CHANGELOG.md` under a new heading.
5. Keep the diff focused.
