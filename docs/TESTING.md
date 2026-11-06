# Testing

## Tools

- [Vitest](https://vitest.dev/) runs the suites in `test/`.
- Coverage is collected with V8 (`@vitest/coverage-v8`) over `src/`.

## Test files

| File | What it covers |
|---|---|
| `test/template.test.ts` | Variables, `each` and `if` blocks, falsy values, else branches, strict mode, syntax errors and limits. |
| `test/markup.test.ts` | Markup parsing of headings, paragraphs, bullets and page breaks; CRLF and tab handling; neutralising data that tries to create structure. |
| `test/layout.test.ts` | Baseline positions, greedy wrapping, bullets, headings, page breaks, overflow to new pages, the 500-page limit and page spec validation. |
| `test/pdf.test.ts` | The pdf-lib renderer: byte-identical output, metadata, dates, WinAnsi handling, `replaceUnsupported`, the fake renderer and input validation of metadata and pages. |
| `test/index.test.ts` | The exact set of value exports of `src/index.ts`, an end-to-end run with the fake renderer, and `PdfTemplateError` fields. |
| `test/acceptance.test.ts` | Acceptance-level checks across templates, layout, PDF generation and WinAnsi behaviour. |

## Commands

```sh
npm test            # vitest run --coverage
npx vitest          # watch mode while developing
npm run check       # every gate, including tests
```

## Rules

- Coverage must stay at or above 80 % for lines, branches, functions and statements (`vitest.config.ts`). Lowering the thresholds is not allowed.
- Test through the public entry point (`src/index.ts`) and assert observable behavior: return values, thrown errors and their codes.
- Each bug fix adds a test that fails without the fix.
- Tests use no network. The layout tests use a fake font metric (`0.5 * size * text.length`), so expected positions are exact.

## Reports

Coverage reports are written to `coverage/` (text summary and `lcov`). The folder is ignored by git.
