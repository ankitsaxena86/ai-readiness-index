# Widget Toolkit

[![CI](https://example.com/badge.svg)](https://example.com/ci)
[![npm](https://example.com/npm.svg)](https://example.com/npm)

A small, well-documented toolkit for composing and validating **widgets**. It is
intended as a reference example of a repository that is easy for both humans and
AI coding assistants to work in.

## Overview

Widget Toolkit turns declarative widget descriptions into validated, renderable
objects. The core is a pure function pipeline: parse → validate → normalize →
render. Everything is strongly typed and every public function has tests.

## Installation

```bash
npm install widget-toolkit
```

Requires Node.js 20 or newer.

## Usage

```ts
import { createWidget, renderWidget } from 'widget-toolkit';

const widget = createWidget({ kind: 'button', label: 'Save' });
console.log(renderWidget(widget)); // "<button>Save</button>"
```

## Configuration

Behavior is controlled through `widget.config.json`:

```json
{
  "strictValidation": true,
  "defaultTheme": "light"
}
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the module layout and the
request flow. Design decisions are recorded as ADRs in [docs/adr/](docs/adr/).

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

## Testing

Unit tests live in `test/` and run under Vitest. Every module in `src/` has a
matching spec. CI runs the full suite plus lint and type-check on every push.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: open an issue first, keep PRs
focused, add tests, and update the CHANGELOG.

## License

MIT — see [LICENSE](LICENSE).
