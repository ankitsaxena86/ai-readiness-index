# Architecture

Widget Toolkit is a pure transformation pipeline with a thin IO shell.

## Modules

| Module | Responsibility |
|---|---|
| `src/parse/` | Turn raw JSON into a `RawWidget` structure. No validation. |
| `src/validate/` | Check a `RawWidget` against the schema; produce typed errors. |
| `src/normalize/` | Fill defaults, resolve themes, sort children deterministically. |
| `src/render/` | Turn a `Widget` into an HTML string. |
| `src/io/` | The only place that touches the filesystem or clock. |

## Request flow

```
JSON string
  → parse.parseWidget      (RawWidget)
  → validate.validateWidget (Widget | ValidationError[])
  → normalize.normalizeWidget (Widget)
  → render.renderWidget     (string)
```

Each stage is a pure function. The pipeline is assembled in `src/index.ts`.

## Why a pipeline

See [adr/0002-pure-pipeline.md](adr/0002-pure-pipeline.md). The short version:
pure stages are trivial to test and let an assistant reason about one transform
at a time.

## Error handling

Validation returns errors as values (`ValidationError[]`), never throws. Only
`src/io/` throws, and only for genuine IO failure.
