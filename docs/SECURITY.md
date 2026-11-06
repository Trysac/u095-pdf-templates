# Security practices

How this repository keeps the package and its users safe. The disclosure policy is in [../SECURITY.md](../SECURITY.md).

## Threat model

The main untrusted inputs are template text, template data and document metadata.

Defended:

- Data creating document structure: values are stringified, CR, LF and tab become spaces, and a value that starts a line with `#`, `-` or a backslash is prefixed with a backslash, so headings, bullets and page breaks cannot be injected.
- Prototype access: paths may not contain `__proto__`, `constructor` or `prototype`, and only own properties are read (`Object.hasOwn`), so inherited keys such as `toString` count as missing.
- Resource exhaustion: template size is capped at 256 KiB, block nesting at 16, `each` iterations at 10,000 per render, path segments at 10, rendered markup at 4 MiB, pages at 500, and metadata strings at 1,000 characters.
- Error messages: untrusted text is shortened with `clip` and messages are capped at 200 characters.
- Unencodable text: characters outside WinAnsi are rejected with `unsupported_character` before drawing, unless `replaceUnsupported` is set.

Not defended:

- Template logic errors that the author intends, such as an empty `each` loop producing an unexpected layout, are not detected.
- The library does not sanitise the content of values beyond the rules above; text is printed as given within WinAnsi.
- Denial of service within the limits is still possible: a 4 MiB markup with many pages up to 500 pages is accepted by the parser and then bounded by the page limit.
- The fake renderer and `createFakeRenderer` are for tests and are not hardened.
- Output bytes are deterministic, but the library does not sign, encrypt or otherwise protect the PDF.

## Secrets

- No secrets, tokens or credentials in the repository, commit history, logs or prompts.
- `gitleaks` runs as the last step of `npm run check` and as a dedicated CI job. Its configuration is `.gitleaks.toml`.
- Publishing credentials live only in the CI secret store or the maintainer's local npm configuration.

## Dependencies

- The only runtime dependency is `pdf-lib` (^1.17.1). Development dependencies are limited to the toolchain listed in [STACK.md](STACK.md).
- Dependabot opens weekly updates for npm packages and GitHub Actions.
- Commit the generated `package-lock.json` so installs are reproducible.

## Code

- No `eval`, dynamic `Function` construction or shelling out from library code.
- Inputs from callers are validated and rejected with explicit `PdfTemplateError` codes.

## Publishing

- Packages are published from a clean checkout after `npm run check` passes.
- Only `dist/` is included in the published tarball.
