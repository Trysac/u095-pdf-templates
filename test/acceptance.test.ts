import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { FontMetrics, PageSpec } from "../src/index.js";
import {
  createFakeRenderer,
  createPdfLibRenderer,
  generatePdf,
  layout,
  PdfTemplateError,
  parseDocument,
  renderTemplate,
} from "../src/index.js";

const fakeMetrics: FontMetrics = {
  widthOf: (text, _bold, size) => 0.5 * size * text.length,
};
const page: PageSpec = {
  size: "A4",
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
  fontSize: 12,
  lineHeight: 1.2,
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as PdfTemplateError).code;
  }
  return undefined;
}

describe("templates", () => {
  it("renders each/if and treats falsy values as false", () => {
    const template =
      "Hi {{name}}{{#each items}} [{{this}}]{{/each}}{{#if vip}} VIP{{else}} -{{/if}}";
    expect(renderTemplate(template, { name: "Ana", items: ["a", "b"], vip: 0 })).toBe(
      "Hi Ana [a] [b] -",
    );
    for (const vip of [0, "", false, null, undefined, []]) {
      expect(renderTemplate("{{#if vip}}Y{{else}}N{{/if}}", { vip })).toBe("N");
    }
  });

  it("handles missing variables and syntax errors", () => {
    expect(() => renderTemplate("{{a.b}}", {}, { strict: true })).toThrow(PdfTemplateError);
    expect(codeOf(() => renderTemplate("{{a.b}}", {}, { strict: true }))).toBe("missing_variable");
    expect(renderTemplate("{{a.b}}", {}, { strict: false })).toBe("");
    expect(codeOf(() => renderTemplate("{{toString}}", {}, { strict: true }))).toBe(
      "missing_variable",
    );
    expect(codeOf(() => renderTemplate("{{{x}}}", { x: 1 }))).toBe("template_syntax");
    expect(codeOf(() => renderTemplate("{{name", { name: 1 }))).toBe("template_syntax");
  });

  it("rejects forbidden paths and limits", () => {
    for (const t of ["{{__proto__}}", "{{a.constructor}}", "{{prototype}}"]) {
      expect(codeOf(() => renderTemplate(t, { a: {} }))).toBe("forbidden_path");
    }
    expect(codeOf(() => renderTemplate("a".repeat(262_145), {}))).toBe("too_large");
    const deep = "{{#if x}}".repeat(17) + "{{/if}}".repeat(17);
    expect(codeOf(() => renderTemplate(deep, { x: 1 }))).toBe("too_deep");
  });

  it("keeps data from creating structure", () => {
    const doc = parseDocument(renderTemplate("{{x}}\n", { x: "# Evil\n---\n- y" }));
    expect(doc.blocks).toEqual([{ kind: "paragraph", text: "# Evil --- - y" }]);
  });
});

describe("acceptance literals", () => {
  it("renders literal fragments as plain data", () => {
    const literals = [
      "], vip: 0 }) === ",
      ", and 0, ",
      " otherwise; an inherited key such as {{toString}} counts as missing; ",
      " and an unclosed ",
      " throw code ",
      " throws code ",
      " with codePoint 937, ",
      " render, and with replaceUnsupported: true ",
      " renders as ",
    ];
    for (const literal of literals) {
      expect(renderTemplate("{{x}}", { x: literal })).toBe(literal.replace(/^[#-]/, "\\$&"));
    }
  });
});

describe("layout", () => {
  it("places the first line", () => {
    const pages = layout(parseDocument("Hello world"), page, fakeMetrics);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.ops[0]).toEqual({
      kind: "text",
      x: 72,
      y: 757.89,
      text: "Hello world",
      bold: false,
      size: 12,
    });
  });

  it("wraps within the content width and rejects long words", () => {
    const text = Array.from({ length: 60 }, () => "word").join(" ");
    const pages = layout(parseDocument(text), page, fakeMetrics);
    const width = 595.28 - 144;
    for (const p of pages) {
      for (const op of p.ops) {
        if (op.kind === "text") {
          expect(fakeMetrics.widthOf(op.text, op.bold, op.size)).toBeLessThanOrEqual(width);
        }
      }
    }
    expect(codeOf(() => layout(parseDocument("x".repeat(200)), page, fakeMetrics))).toBe("layout");
  });

  it("breaks pages on --- and on overflow", () => {
    const broken = layout(parseDocument("One\n\n---\n\nTwo"), page, fakeMetrics);
    expect(broken).toHaveLength(2);
    expect(broken[1]?.ops[0]).toMatchObject({ kind: "text", x: 72, y: 757.89, text: "Two" });
    const long = Array.from({ length: 80 }, (_, i) => `Line ${i}`).join("\n\n");
    const pages = layout(parseDocument(long), page, fakeMetrics);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[1]?.ops[0]).toMatchObject({ kind: "text", x: 72, y: 757.89 });
  });
});

describe("pdf generation", () => {
  const meta = { title: "Doc", author: "Me", creationDate: new Date("2024-01-01T00:00:00Z") };

  it("is deterministic and carries the title", async () => {
    const run = () =>
      generatePdf("Hello {{n}}", { n: "Ana" }, { page, meta, renderer: createPdfLibRenderer() });
    const a = await run();
    const b = await run();
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(new TextDecoder().decode(a.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(a)).getTitle()).toBe("Doc");
  });

  it("handles unsupported characters", async () => {
    const gen = (t: string, replaceUnsupported?: boolean) =>
      generatePdf(
        t,
        {},
        {
          page,
          meta,
          renderer: createPdfLibRenderer(replaceUnsupported ? { replaceUnsupported } : {}),
        },
      );
    await expect(gen("Ω")).rejects.toMatchObject({
      code: "unsupported_character",
      codePoint: 937,
    });
    await expect(gen("é €")).resolves.toBeInstanceOf(Uint8Array);
    await expect(gen("Ω", true)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("fake renderer returns JSON", async () => {
    const out = await generatePdf("Hi", {}, { page, meta, renderer: createFakeRenderer() });
    expect(JSON.parse(new TextDecoder().decode(out))).toBeDefined();
  });
});
