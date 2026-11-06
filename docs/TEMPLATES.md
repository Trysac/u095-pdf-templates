# Templates, markup and layout

This document describes the three pure steps behind `generatePdf` and the renderer port.

## Template language

A small Mustache subset, evaluated in a single pass (data is never re-evaluated as a template):

| Tag | Meaning |
|---|---|
| `{{path}}` | Prints a value. |
| `{{#each path}}...{{/each}}` | Repeats the body for every array item; `this` is the item. |
| `{{#if path}}...{{else}}...{{/if}}` | Chooses a branch. `0`, `""`, `false`, `null`, `undefined`, `NaN`, `[]` and missing values are falsy. |

Rules:

- Paths are dotted, use own properties only (`Object.hasOwn`) and have at most 10 segments. `__proto__`, `constructor` and `prototype` are `forbidden_path`. A path starting with `this` is relative to the current item; any other path starts at the data root.
- There are no helpers, partials, functions or triple braces. Unknown or unclosed tags are `template_syntax` with the 1-based `line`.
- A missing variable renders nothing, or throws `missing_variable` when `strict` is set. `{{#if}}` treats a missing path as falsy in both modes.
- A value that is not a string, number, boolean, bigint, null or undefined cannot be printed and throws `missing_variable`.
- Block tags leave surrounding newlines in place; write `{{#each items}}- {{this}}` followed by a newline inside the block to produce one bullet per item.

### Data cannot create structure

Values are stringified, and CR, LF and tab become spaces. When a value begins a line and starts with `#`, `-` or a backslash, a backslash is placed in front of it. `parseDocument` reads a line that starts with a backslash as paragraph text without that backslash.

## Markup

`# ` heading (bold, 1.6 x the font size), `## ` subheading (bold, 1.3 x), blank-line separated paragraphs, `- ` bullets with a hanging indent and `---` for a page break. Anything else is paragraph text.

## Layout

`layout` is pure: it takes a document, a `PageSpec` and a `FontMetrics` and returns pages of drawing operations in PDF points (y measured from the bottom). A4 is 595.28 x 841.89 and Letter is 612 x 792. The first baseline is `height - top - size`; every following line is `size * lineHeight` lower. Values are rounded to 2 decimals. Lines are wrapped greedily at spaces; a single word wider than the content width is a `layout` error. A page break closes the page; empty pages are never produced.

## Renderers

`createPdfLibRenderer` uses the standard Helvetica and Helvetica-Bold fonts, so text must be WinAnsi. Unsupported characters throw `unsupported_character` (with `codePoint`), or become `?` with `replaceUnsupported: true`. U+00A0 and U+00AD are not accepted. Output is deterministic: fixed producer and creator, dates taken from the metadata, no object streams. `createFakeRenderer` uses `0.5 * size * text.length` as the text width and returns the pages as UTF-8 JSON.

## Limits

| Limit | Value | Error |
|---|---|---|
| Template size | 256 KiB (262,144 bytes) | `too_large` |
| Block nesting | 16 | `too_deep` |
| Path segments | 10 | `too_deep` |
| Total `each` iterations | 10,000 | `too_large` |
| Rendered markup | 4 MiB | `too_large` |
| Pages | 500 | `too_large` |
| Title and author | 1,000 characters | `too_large` |
