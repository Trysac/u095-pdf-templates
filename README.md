# pdf-templates

[![npm version](https://img.shields.io/npm/v/@trysac/pdf-templates.svg)](https://www.npmjs.com/package/@trysac/pdf-templates)
[![license: MIT](https://img.shields.io/npm/l/@trysac/pdf-templates.svg)](LICENSE)
[![CI](https://github.com/Trysac/u095-pdf-templates/actions/workflows/ci.yml/badge.svg)](https://github.com/Trysac/u095-pdf-templates/actions/workflows/ci.yml)

Render letters, reports and certificates from safe text templates to deterministic PDFs, with a pure layout engine and a renderer port.

## Problem

Generating simple business documents usually means running headless Chromium to print HTML, which is heavy, slow and yields different bytes on every run. Low-level PDF libraries are light but force manual coordinates and line breaking. This package combines a safe Mustache-subset template engine, a minimal markup and a pure greedy word-wrap layout engine on top of pdf-lib to produce repeatable PDFs that are easy to test.

## Install

```sh
npm install @trysac/pdf-templates
```

Requires Node.js 20 or newer. The package ships ES modules with TypeScript declarations. Its only runtime dependency is `pdf-lib` (^1.17.1).

## Usage

```ts
import { generatePdf } from "@trysac/pdf-templates";

const bytes = await generatePdf("# Hello {{name}}\n\nWelcome aboard.", { name: "Ana" }, {
  page: { size: "A4", margins: { top: 72, right: 72, bottom: 72, left: 72 }, fontSize: 12, lineHeight: 1.2 },
  meta: { title: "Welcome", creationDate: new Date("2024-01-01T00:00:00Z") },
});
console.log(bytes.length);
```

The default renderer is the pdf-lib renderer, so `renderer` may be omitted.

## API

| Export | Signature | Description |
|---|---|---|
| `renderTemplate` | `(template: string, data, opts?: { strict?: boolean }) => string` | Renders the template to markup. Missing values print nothing, or throw `missing_variable` when `strict` is true. |
| `parseDocument` | `(markup: string) => DocumentModel` | Parses `# ` and `## ` headings, blank-line separated paragraphs, `- ` bullets and `---` page breaks. |
| `layout` | `(doc, page: PageSpec, metrics: FontMetrics) => LaidOutPage[]` | Greedy word wrap at spaces, in PDF points measured from the bottom-left. |
| `createPdfLibRenderer` | `(opts?: { replaceUnsupported?: boolean }) => PdfRenderer` | Deterministic renderer using Helvetica and Helvetica-Bold with WinAnsi text only. |
| `createFakeRenderer` | `() => PdfRenderer` | Test renderer: metrics are `0.5 * size * text.length`, output is UTF-8 JSON of the laid out pages. |
| `generatePdf` | `(template, data, opts: { page: PageSpec; meta: PdfMeta; renderer?: PdfRenderer; strict?: boolean }) => Promise<Uint8Array>` | Runs render, parse, layout and render in one call. |

Types exported: `PageSpec`, `FontMetrics`, `LaidOutPage`, `LayoutOp`, `TextOp`, `LineOp`, `DocumentModel`, `Block`, `PdfMeta`, `PdfRenderer`, `PdfLibRendererOptions`, `RenderOptions`, `GeneratePdfOptions`, `PdfTemplateErrorCode`, `PdfTemplateErrorDetails`.

`PageSpec` sizes are `A4` (595.28 x 841.89 pt) and `Letter` (612 x 792 pt). Margins are in points. `fontSize` must be positive and at most 1000; `lineHeight` must be positive and at most 10.

### Errors

All failures are `PdfTemplateError`. Branch on `code`, not on the message. Codes: `template_syntax`, `missing_variable`, `forbidden_path`, `layout`, `unsupported_character`, `too_large`, `too_deep`. Optional fields `line`, `path` and `codePoint` are set when known.

### Template syntax and limits

Tags: `{{path}}`, `{{#each path}}...{{/each}}` (use `this` for the item) and `{{#if path}}...{{else}}...{{/if}}`. Paths are dotted, use own properties only, and have at most 10 segments. Helpers, partials, functions and triple braces are not supported.

Limits: template 256 KiB, block nesting 16, 10,000 `each` iterations per render, 500 pages, markup 4 MiB, metadata strings 1,000 characters.

## Why not Puppeteer

Puppeteer prints HTML through a headless browser. This package needs no browser, produces the same bytes for the same input, and separates layout into a pure step that can be unit tested. It supports only plain text with the standard Helvetica fonts, so it does not replace HTML rendering.

## Security

The threat model, defended and undefended cases, is in [docs/SECURITY.md](docs/SECURITY.md).

## Development

```sh
npm install
npm run check   # lint, format, types, tests with coverage, docs, secrets
```

See [AGENTS.md](AGENTS.md) for the full command list and [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

## License

[MIT](LICENSE) © 2026 Miguel Gomez
