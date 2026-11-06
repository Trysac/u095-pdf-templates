# Project record: pdf-templates

## Objective

Provide a small library that renders letters, reports and certificates from safe text templates to deterministic PDF files. The library avoids a headless browser, separates layout into a pure step that can be tested, and makes template data unable to create document structure.

The intended users are developers in Node.js 20+ projects who need simple text-based business documents generated repeatably.

## Scope

In scope:

- The public API documented in the README: template rendering, markup parsing, layout, the pdf-lib renderer, a fake renderer and `generatePdf`.
- Text documents with the standard Helvetica and Helvetica-Bold fonts, WinAnsi encoding only.
- Headings, paragraphs, bullets, page breaks, line drawing operations and document metadata (title, author, creation date).

Out of scope:

- Tables, inline bold or italic within a paragraph, images, custom or embedded fonts, and HTML input.
- Forms, signatures, encryption and right-to-left text.
- A command-line interface.
- Characters outside WinAnsi, except that they can be replaced with `?` when `replaceUnsupported` is set.

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created from the factory utility template. |

## Effort metrics

Measured values only. Leave "pending measurement" until a real figure is recorded; never estimate here.

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 441641 / 125845 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 0.9102 | factory ledger |

## Factory run u095 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | claude-sonnet-5-5 | yes | 2609 | 102890 | 0 | 4473 | 0.5175 |
| fix-1 | claude-sonnet-5-5 | no | 8 | 1137 | 15404 | 64062 | 0.0563 |
| audit | claude-sonnet-5-5 | no | 16 | 7643 | 42544 | 210936 | 0.2039 |
| fix-2 | claude-sonnet-5-5 | no | 8 | 5131 | 13942 | 61021 | 0.0923 |
| fix-3 | claude-sonnet-5-5 | no | 8 | 978 | 6606 | 60593 | 0.0324 |
| docs | claude-haiku-5-5 | no | 37907 | 8066 | 0 | 0 | 0.0078 |

Total: $0.9102. Prices: Anthropic list prices.
