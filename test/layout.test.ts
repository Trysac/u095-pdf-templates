import { describe, expect, it } from "vitest";
import {
  createFakeRenderer,
  type FontMetrics,
  layout,
  type PageSpec,
  PdfTemplateError,
  parseDocument,
  type TextOp,
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
const CONTENT_WIDTH = 595.28 - 144;

function run(markup: string, spec: PageSpec = page) {
  return layout(parseDocument(markup), spec, fakeMetrics);
}

function textOps(markup: string, spec: PageSpec = page): TextOp[] {
  return run(markup, spec).flatMap((laid) =>
    laid.ops.filter((op): op is TextOp => op.kind === "text"),
  );
}

function codeOf(runner: () => unknown): string {
  try {
    runner();
  } catch (error) {
    if (error instanceof PdfTemplateError) {
      return error.code;
    }
    throw error;
  }
  return "none";
}

describe("layout basics", () => {
  it("places the first baseline at height - top - size", () => {
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
    expect(pages[0]?.width).toBe(595.28);
    expect(pages[0]?.height).toBe(841.89);
  });

  it("matches the fake renderer metrics", async () => {
    const metrics = await createFakeRenderer().metrics();
    expect(metrics.widthOf("abcd", true, 10)).toBe(20);
    const pages = layout(parseDocument("Hello world"), page, metrics);
    expect(pages[0]?.ops).toHaveLength(1);
  });

  it("supports Letter", () => {
    const pages = run("Hello", { ...page, size: "Letter" });
    expect(pages[0]?.width).toBe(612);
    expect(pages[0]?.height).toBe(792);
    expect(pages[0]?.ops[0]).toMatchObject({ x: 72, y: 708 });
  });

  it("wraps greedily and never exceeds the content width", () => {
    const words = Array.from({ length: 16 }, () => "word").join(" ");
    const ops = textOps(words);
    expect(ops).toHaveLength(2);
    expect(ops[0]?.text).toBe(Array.from({ length: 15 }, () => "word").join(" "));
    expect(ops[1]?.text).toBe("word");
    expect(ops[1]?.y).toBeCloseTo(743.49, 2);
    const long = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");
    for (const op of textOps(long)) {
      expect(fakeMetrics.widthOf(op.text, op.bold, op.size)).toBeLessThanOrEqual(CONTENT_WIDTH);
    }
  });

  it("collapses repeated spaces between words", () => {
    const ops = textOps("a    b");
    expect(ops.map((op) => op.text)).toEqual(["a b"]);
  });

  it("throws layout for a word wider than the content width", () => {
    const word = "a".repeat(100);
    expect(codeOf(() => run(word))).toBe("layout");
    expect(codeOf(() => run(`ok ${word}`))).toBe("layout");
    const huge = "a".repeat(5000);
    try {
      run(huge);
    } catch (error) {
      expect((error as Error).message.length).toBeLessThanOrEqual(200);
    }
  });

  it("accepts a word exactly as wide as the content area", () => {
    const tight: PageSpec = {
      ...page,
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
    };
    expect(textOps("a".repeat(75), tight)).toHaveLength(1);
  });
});

describe("layout blocks", () => {
  it("sizes headings and subheadings and keeps line spacing", () => {
    const ops = textOps("# Title\n\nBody\n\n## Sub");
    expect(ops[0]).toMatchObject({ x: 72, text: "Title", bold: true, size: 19.2 });
    expect(ops[0]?.y).toBeCloseTo(750.69, 2);
    expect(ops[1]).toMatchObject({ text: "Body", bold: false, size: 12 });
    expect(ops[1]?.y).toBeCloseTo(736.29, 2);
    expect(ops[2]).toMatchObject({ text: "Sub", bold: true, size: 15.6 });
    expect(ops[2]?.y).toBeCloseTo(736.29 - 18.72, 2);
  });

  it("draws bullets with a hanging indent", () => {
    const ops = textOps("- one two");
    expect(ops).toEqual([
      { kind: "text", x: 72, y: 757.89, text: "•", bold: false, size: 12 },
      { kind: "text", x: 90, y: 757.89, text: "one two", bold: false, size: 12 },
    ]);
    const words = Array.from({ length: 15 }, () => "word").join(" ");
    const wrapped = textOps(`- ${words}`);
    expect(wrapped).toHaveLength(3);
    expect(wrapped[2]).toMatchObject({ x: 90, text: "word" });
    expect(wrapped[2]?.y).toBeCloseTo(743.49, 2);
  });

  it("starts a new page at a --- line", () => {
    const pages = run("A\n---\nB");
    expect(pages).toHaveLength(2);
    expect(pages[0]?.ops[0]).toMatchObject({ x: 72, y: 757.89, text: "A" });
    expect(pages[1]?.ops[0]).toMatchObject({ x: 72, y: 757.89, text: "B" });
  });

  it("never produces empty pages for leading, trailing or repeated breaks", () => {
    expect(run("---\nA\n---\n")).toHaveLength(1);
    expect(run("A\n---\n---\nB")).toHaveLength(2);
    expect(run("A\n\n---")).toHaveLength(1);
  });

  it("returns one empty page for an empty document", () => {
    const pages = run("");
    expect(pages).toHaveLength(1);
    expect(pages[0]?.ops).toEqual([]);
  });

  it("continues overflowing content on a new page with the same margins", () => {
    const word = "w".repeat(70);
    const markup = Array.from({ length: 100 }, () => word).join(" ");
    const pages = run(markup);
    expect(pages.map((laid) => laid.ops.length)).toEqual([48, 48, 4]);
    expect(pages[0]?.ops[47]?.kind).toBe("text");
    const last = pages[0]?.ops[47] as TextOp;
    expect(last.y).toBeCloseTo(81.09, 2);
    expect(pages[1]?.ops[0]).toMatchObject({ x: 72, y: 757.89 });
    expect(pages[2]?.ops[0]).toMatchObject({ x: 72, y: 757.89 });
  });

  it("keeps a bullet marker and its text on the same page", () => {
    const word = "w".repeat(70);
    const filler = Array.from({ length: 48 }, () => word).join(" ");
    const pages = run(`${filler}\n\n- tail`);
    expect(pages).toHaveLength(2);
    const ops = pages[1]?.ops ?? [];
    expect(ops.map((op) => (op.kind === "text" ? op.text : ""))).toEqual(["•", "tail"]);
  });

  it("allows 500 pages and rejects 501", () => {
    const make = (count: number): string =>
      Array.from({ length: count }, () => "A").join("\n---\n");
    expect(run(make(500))).toHaveLength(500);
    expect(codeOf(() => run(make(501)))).toBe("too_large");
  });
});

describe("layout validation", () => {
  it("rejects invalid page specs", () => {
    const bad: PageSpec[] = [
      { ...page, size: "B5" as PageSpec["size"] },
      { ...page, margins: { ...page.margins, top: -1 } },
      { ...page, margins: { ...page.margins, left: Number.NaN } },
      { ...page, fontSize: 0 },
      { ...page, fontSize: 1001 },
      { ...page, lineHeight: 0 },
      { ...page, lineHeight: 11 },
    ];
    for (const spec of bad) {
      expect(codeOf(() => run("x", spec))).toBe("layout");
    }
  });

  it("rejects margins that leave no room", () => {
    const wide = { ...page, margins: { top: 72, right: 300, bottom: 72, left: 300 } };
    expect(codeOf(() => run("x", wide))).toBe("layout");
    const flat = { ...page, margins: { top: 500, right: 72, bottom: 400, left: 72 } };
    expect(codeOf(() => run("x", flat))).toBe("layout");
  });

  it("rejects a content area too small for one line", () => {
    const small = { ...page, margins: { top: 400, right: 72, bottom: 440, left: 72 } };
    expect(codeOf(() => run("x", small))).toBe("layout");
  });
});
