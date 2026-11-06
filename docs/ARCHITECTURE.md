# Architecture

## Overview

`@trysac/pdf-templates` is a TypeScript library published to npm as ES modules with type declarations. It renders letters, reports and certificates from safe text templates to deterministic PDFs. It has a pure layout engine and a renderer port; the default renderer uses pdf-lib.

The data flow of `generatePdf` is: `renderTemplate` (template and data to markup), `parseDocument` (markup to blocks), `layout` (blocks to positioned operations per page), and a renderer `render` (operations to PDF bytes).

## Modules

| Module | Responsibility |
|---|---|
| `src/index.ts` | Public entry point. Re-exports the API listed in the README. |
| `src/template.ts` | Parses and renders the Mustache-subset template; enforces path, nesting, iteration and size limits; neutralises structural data values. |
| `src/markup.ts` | Parses the minimal markup into blocks; defines the escape prefix shared with the template engine. |
| `src/layout.ts` | Validates the page spec, measures and wraps text greedily, paginates and produces text and line operations. |
| `src/renderers.ts` | `PdfRenderer` port; the pdf-lib renderer with WinAnsi checks and deterministic metadata; the fake renderer for tests. |
| `src/generate.ts` | `generatePdf`, which composes the steps above. |
| `src/errors.ts` | `PdfTemplateError` and its stable error codes; `clip` for shortening untrusted text in messages. |
| `src/limits.ts` | Numeric limits shared by the modules. |

## Boundaries

- One runtime dependency, `pdf-lib`, used only by `src/renderers.ts`. Any further addition is justified in [STACK.md](STACK.md).
- No I/O at import time. The template, markup and layout functions are pure. The renderer is pure in the sense that identical input produces identical bytes.
- Errors are thrown as `PdfTemplateError` with a stable `code`. Messages are capped at 200 characters.
- Renderer output is limited to standard Helvetica fonts with WinAnsi encoding; no custom fonts or images are supported.

## Layout coordinates

Coordinates are PDF points measured from the bottom-left of the page. The first baseline of a page is `height - top - size`, and each following line is `size * lineHeight` lower. Values are rounded to 2 decimals.

## Build and distribution

`npm run build` compiles `src/` to `dist/` with `tsconfig.build.json`. Only `dist/` is published (`files` in `package.json`).

## Decisions

Architectural decisions are recorded in [decisions/](decisions/), starting with [0001](decisions/0001-record-architecture-decisions.md).
