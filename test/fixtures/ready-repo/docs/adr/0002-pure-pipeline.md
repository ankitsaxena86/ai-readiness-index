# 2. Use a pure transformation pipeline

Date: 2026-01-12

## Status

Accepted

## Context

Widget processing has four distinct concerns: parsing, validation, normalization,
and rendering. Mixing them made the original prototype hard to test.

## Decision

Each concern is a pure function in its own module. Side effects (filesystem,
clock, randomness) are confined to `src/io/`. The pipeline is composed in
`src/index.ts`.

## Consequences

- Each stage is unit-testable in isolation with plain inputs and outputs.
- An assistant can reason about one transform without loading the whole system.
- Composition overhead: the pipeline wiring is explicit and slightly verbose.
