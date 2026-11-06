import { describe, expect, it } from "vitest";
import { PdfTemplateError, parseDocument, renderTemplate } from "../src/index.js";

describe("parseDocument", () => {
  it("parses headings, paragraphs, bullets and page breaks", () => {
    const markup = "# Title\n\n## Sub\nPara one\nline two\n\n- a\n- b\n---\nlast";
    expect(parseDocument(markup).blocks).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "heading", level: 2, text: "Sub" },
      { kind: "paragraph", text: "Para one line two" },
      { kind: "bullet", text: "a" },
      { kind: "bullet", text: "b" },
      { kind: "pageBreak" },
      { kind: "paragraph", text: "last" },
    ]);
  });

  it("returns no blocks for empty input", () => {
    expect(parseDocument("").blocks).toEqual([]);
    expect(parseDocument("\n\n  \n").blocks).toEqual([]);
  });

  it("accepts CRLF, CR and tabs", () => {
    const blocks = parseDocument("a\r\nb\r\rc\td").blocks;
    expect(blocks).toEqual([
      { kind: "paragraph", text: "a b" },
      { kind: "paragraph", text: "c d" },
    ]);
  });

  it("does not treat near misses as structure", () => {
    const lines = ["#nospace", "### three", "-nospace", "----", "--"];
    for (const line of lines) {
      expect(parseDocument(line).blocks).toEqual([{ kind: "paragraph", text: line }]);
    }
  });

  it("reads a backslash line as paragraph text", () => {
    const bs = String.fromCharCode(92);
    expect(parseDocument(`${bs}# not a heading`).blocks).toEqual([
      { kind: "paragraph", text: "# not a heading" },
    ]);
    expect(parseDocument(`${bs}\nplain`).blocks).toEqual([{ kind: "paragraph", text: "plain" }]);
  });

  it("rejects markup above 4 MiB", () => {
    expect(() => parseDocument("a".repeat(4_194_305))).toThrow(PdfTemplateError);
    expect(parseDocument("a".repeat(4_194_304)).blocks).toHaveLength(1);
  });
});

describe("data never creates structure", () => {
  it("keeps '# Evil\\n---\\n- y' as one paragraph", () => {
    const markup = renderTemplate("{{x}}\n", { x: "# Evil\n---\n- y" });
    expect(parseDocument(markup).blocks).toEqual([{ kind: "paragraph", text: "# Evil --- - y" }]);
  });

  it("neutralises structural values at the start of a line", () => {
    const bs = String.fromCharCode(92);
    const values = ["# h", "## h", "- a", "---", `${bs}# x`, "  # h", "-5"];
    for (const x of values) {
      const blocks = parseDocument(renderTemplate("{{x}}", { x })).blocks;
      expect(blocks).toEqual([{ kind: "paragraph", text: x.trim() }]);
    }
  });

  it("neutralises values between template lines and after spaces", () => {
    const middle = renderTemplate("intro\n{{x}}\noutro", { x: "# h" });
    expect(parseDocument(middle).blocks).toEqual([{ kind: "paragraph", text: "intro # h outro" }]);
    const spaced = renderTemplate("{{a}} {{b}}", { a: "", b: "- x" });
    expect(parseDocument(spaced).blocks).toEqual([{ kind: "paragraph", text: "- x" }]);
  });

  it("still lets the template author write structure", () => {
    const template = "# {{title}}\n{{#each items}}- {{this}}\n{{/each}}";
    const markup = renderTemplate(template, { title: "T", items: ["a", "b"] });
    expect(parseDocument(markup).blocks).toEqual([
      { kind: "heading", level: 1, text: "T" },
      { kind: "bullet", text: "a" },
      { kind: "bullet", text: "b" },
    ]);
  });
});
