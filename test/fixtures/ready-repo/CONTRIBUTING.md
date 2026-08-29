# Contributing to Widget Toolkit

Thanks for helping out! This document explains how to propose changes.

## Getting set up

```bash
git clone <this repo>
cd widget-toolkit
npm install
npm test
```

## Workflow

1. Open an issue describing the change before starting significant work.
2. Create a branch: `feature/short-description` or `fix/short-description`.
3. Make your change with tests. Keep the diff focused.
4. Run `npm run lint` and `npm test` locally.
5. Update `CHANGELOG.md` under the `[Unreleased]` heading.
6. Open a pull request. CI must be green before review.

## Code style

- TypeScript strict mode. No `any` without a comment justifying it.
- Every exported function has a doc comment and at least one test.
- Prefer pure functions; isolate side effects in `src/io/`.

## Commit messages

Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).

## Reporting bugs

Include the widget input, the expected output, and the actual output.
