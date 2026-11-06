import { PdfTemplateError } from "./errors.js";
import { MAX_MARKUP_CHARS } from "./limits.js";

/** Prefix (a backslash) that turns a markup line into plain paragraph text. */
export const ESCAPE_PREFIX = String.fromCharCode(92);

/** One block of a parsed document. */
export type Block =
  | {
      readonly kind: "heading";
      readonly level: 1 | 2;
      readonly text: string;
    }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "bullet"; readonly text: string }
  | { readonly kind: "pageBreak" };

/** A parsed document: an ordered list of blocks. */
export interface DocumentModel {
  readonly blocks: readonly Block[];
}

/**
 * Parses the minimal markup into blocks.
 *
 * Supported: `# ` heading, `## ` subheading, blank-line separated paragraphs,
 * `- ` bullets and `---` page breaks. A line starting with a backslash is
 * paragraph text (the backslash is dropped), which is how template data is
 * kept from creating structure.
 *
 * @param markup - The markup text, at most 4 MiB.
 * @returns The document model.
 * @throws {PdfTemplateError} `too_large` when the markup exceeds the limit.
 */
export function parseDocument(markup: string): DocumentModel {
  if (markup.length > MAX_MARKUP_CHARS) {
    throw new PdfTemplateError("too_large", "Markup is too large");
  }
  const unified = markup.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = unified.split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replaceAll("\t", " ").trim();
    if (line === "") {
      flush();
    } else if (line === "---") {
      flush();
      blocks.push({ kind: "pageBreak" });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "heading", level: 2, text: line.slice(3).trim() });
    } else if (line.startsWith("# ")) {
      flush();
      blocks.push({ kind: "heading", level: 1, text: line.slice(2).trim() });
    } else if (line.startsWith("- ")) {
      flush();
      blocks.push({ kind: "bullet", text: line.slice(2).trim() });
    } else if (line.startsWith(ESCAPE_PREFIX)) {
      const text = line.slice(1).trim();
      if (text !== "") {
        paragraph.push(text);
      }
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return { blocks };
}
