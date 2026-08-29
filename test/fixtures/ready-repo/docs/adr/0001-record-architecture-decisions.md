# 1. Record architecture decisions

Date: 2026-01-10

## Status

Accepted

## Context

We want a durable, reviewable record of why the codebase is shaped the way it is,
so that contributors (and AI assistants) do not have to reverse-engineer intent.

## Decision

We will keep Architecture Decision Records in `docs/adr/`, numbered sequentially,
using the format described by Michael Nygard.

## Consequences

Every non-trivial structural decision gets a short ADR. ADRs are immutable once
accepted; superseding decisions get a new ADR that links back.
