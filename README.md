# pdf-templates

[![npm version](https://img.shields.io/npm/v/@trysac/pdf-templates.svg)](https://www.npmjs.com/package/@trysac/pdf-templates)
[![license: MIT](https://img.shields.io/npm/l/@trysac/pdf-templates.svg)](LICENSE)
[![CI](https://github.com/Trysac/u095-pdf-templates/actions/workflows/ci.yml/badge.svg)](https://github.com/Trysac/u095-pdf-templates/actions/workflows/ci.yml)

Render letters, reports and certificates from safe text templates to deterministic PDFs, with a pure layout engine and a renderer port

## Problem

Describe in two or three sentences the concrete problem this utility solves, who hits it, and why existing
packages do not solve it well. Keep it factual; link to an issue or decision record when there is one.

## Install

```sh
npm install @trysac/pdf-templates
```

Requires Node.js 20 or newer. The package ships ES modules with TypeScript declarations.

## Usage

```ts
import { greet } from "@trysac/pdf-templates";

// Build a greeting; surrounding whitespace is ignored.
const message = greet("  Ada ");
console.log(message); // "Hello, Ada!"

try {
  greet("   ");
} catch (error) {
  console.error((error as Error).message); // "name must not be empty"
}
```

## API

| Export | Signature | Description |
|---|---|---|
| `greet` | `(name: string) => string` | Placeholder API; replace it with the real one. |

## Development

```sh
npm install
npm run check   # lint, format, types, tests with coverage, docs, secrets
```

See [AGENTS.md](AGENTS.md) for the full command list and [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

## License

[MIT](LICENSE) © 2026 Miguel Gomez
