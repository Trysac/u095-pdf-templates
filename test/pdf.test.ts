import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  createFakeRenderer,
  createPdfLibRenderer,
  generatePdf,
  type LaidOutPage,
  type PageSpec,
  type PdfMeta,
  PdfTemplateError,
} from "../src/index.js";

const page: PageSpec = {
  size: "A4",
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
  fontSize: 12,
  lineHeight: 1.2,
};
const meta: PdfMeta = {
  title: "Quarterly report",
  author: "Ana",
  creationDate: new Date("2024-01-02T03:04:05Z"),
};
const template = "# {{title}}\n\nDear {{name}},\n\n- first\n- second\n\nThanks.";
const data = { title: "Report", name: "Ana" };

async function fail(promise: Promise<unknown>): Promise<PdfTemplateError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PdfTemplateError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a PdfTemplateError");
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a).equals(Buffer.from(b));
}

function build(
  text: string,
  values: Record<string, unknown> = {},
  replaceUnsupported = false,
  info: PdfMeta = meta,
): Promise<Uint8Array> {
  const renderer = createPdfLibRenderer({ replaceUnsupported });
  return generatePdf(text, values, { page, meta: info, renderer });
}

describe("pdf-lib renderer", () => {
  it("produces byte-identical PDFs with the right title", async () => {
    const first = await build(template, data);
    const second = await build(template, data);
    expect(same(first, second)).toBe(true);
    expect(new TextDecoder().decode(first.subarray(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(first)).getTitle()).toBe(meta.title);
  });

  it("uses the default renderer when none is given", async () => {
    const bytes = await generatePdf(template, data, { page, meta });
    expect(same(bytes, await build(template, data))).toBe(true);
  });

  it("writes fixed producer, creator and the given dates", async () => {
    const bytes = await build(template, data);
    const loaded = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(loaded.getProducer()).toBe("@trysac/pdf-templates");
    expect(loaded.getCreator()).toBe("@trysac/pdf-templates");
    expect(loaded.getAuthor()).toBe("Ana");
    expect(loaded.getCreationDate()?.getTime()).toBe(meta.creationDate.getTime());
    expect(loaded.getModificationDate()?.getTime()).toBe(meta.creationDate.getTime());
  });

  it("changes the bytes when content or dates change", async () => {
    const base = await build(template, data);
    const other = await build(template, { ...data, name: "Bo" });
    const later = { ...meta, creationDate: new Date("2024-06-01T00:00:00Z") };
    const dated = await build(template, data, false, later);
    expect(same(base, other)).toBe(false);
    expect(same(base, dated)).toBe(false);
  });

  it("omits the author when none is given", async () => {
    const info = { title: "No author", creationDate: meta.creationDate };
    const bytes = await build("Hi", {}, false, info);
    const loaded = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(loaded.getAuthor()).toBeUndefined();
  });

  it("renders one page per page break", async () => {
    const bytes = await build("A\n---\nB");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    const single = await build(template, data);
    expect((await PDFDocument.load(single)).getPageCount()).toBe(1);
  });

  it("renders an empty document as one page", async () => {
    const bytes = await build("");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("draws text and line operations directly", async () => {
    const pages: LaidOutPage[] = [
      {
        width: 200,
        height: 100,
        ops: [
          { kind: "text", x: 10, y: 50, text: "Hi", bold: true, size: 12 },
          { kind: "line", x1: 10, y1: 40, x2: 190, y2: 40 },
        ],
      },
    ];
    const bytes = await createPdfLibRenderer().render(pages, meta);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getPage(0).getSize()).toEqual({ width: 200, height: 100 });
  });

  it("measures with Helvetica and Helvetica-Bold", async () => {
    const metrics = await createPdfLibRenderer().metrics();
    expect(metrics.widthOf("Hello", false, 10)).toBeCloseTo(22.78, 2);
    expect(metrics.widthOf("Hello", true, 12)).toBeGreaterThan(metrics.widthOf("Hello", false, 12));
    expect(metrics.widthOf("", false, 12)).toBe(0);
  });
});

describe("WinAnsi handling", () => {
  it("throws unsupported_character with the code point", async () => {
    const error = await fail(build("Ω"));
    expect(error.code).toBe("unsupported_character");
    expect(error.codePoint).toBe(937);
    expect(error.message.length).toBeLessThanOrEqual(200);
    const next = await fail(build("aΩb 12 Ω,"));
    expect(next.codePoint).toBe(937);
  });

  it("reports astral characters and unsupported slots", async () => {
    const emoji = await fail(build("😀"));
    expect(emoji.codePoint).toBe(128512);
    const nbsp = await fail(build("a\u00a0b"));
    expect(nbsp.codePoint).toBe(160);
  });

  it("renders é and € and the other WinAnsi characters", async () => {
    const bytes = await build("café €");
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
    const extras = await build("‘quoted’ “double” – — … ™ • ÿ");
    expect(extras.length).toBeGreaterThan(0);
  });

  it("renders Ω as ? with replaceUnsupported: true", async () => {
    const replaced = await build("Ω", {}, true);
    const question = await build("?");
    expect(same(replaced, question)).toBe(true);
    const metrics = await createPdfLibRenderer({
      replaceUnsupported: true,
    }).metrics();
    expect(metrics.widthOf("Ω", false, 12)).toBe(metrics.widthOf("?", false, 12));
  });
});

describe("generatePdf and renderer input checks", () => {
  it("passes strict mode to the template step", async () => {
    const renderer = createFakeRenderer();
    const error = await fail(
      generatePdf("{{missing}}", {}, { page, meta, renderer, strict: true }),
    );
    expect(error.code).toBe("missing_variable");
    const bytes = await generatePdf("{{missing}}", {}, { page, meta, renderer });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("propagates layout errors", async () => {
    const renderer = createFakeRenderer();
    const word = "a".repeat(100);
    const error = await fail(generatePdf(word, {}, { page, meta, renderer }));
    expect(error.code).toBe("layout");
  });

  it("returns the fake renderer ops as UTF-8 JSON", async () => {
    const renderer = createFakeRenderer();
    const pages: LaidOutPage[] = [{ width: 1, height: 2, ops: [] }];
    const bytes = await renderer.render(pages, meta);
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual(pages);
  });

  it("validates metadata", async () => {
    const renderer = createPdfLibRenderer();
    const empty: LaidOutPage[] = [];
    const notText = { ...meta, title: 5 as unknown as string };
    const long = { ...meta, title: "x".repeat(1001) };
    const longAuthor = { ...meta, author: "x".repeat(1001) };
    const badDate = { ...meta, creationDate: new Date(Number.NaN) };
    const notDate = { ...meta, creationDate: "now" as unknown as Date };
    expect((await fail(renderer.render(empty, notText))).code).toBe("layout");
    expect((await fail(renderer.render(empty, long))).code).toBe("too_large");
    expect((await fail(renderer.render(empty, longAuthor))).code).toBe("too_large");
    expect((await fail(renderer.render(empty, badDate))).code).toBe("layout");
    expect((await fail(renderer.render(empty, notDate))).code).toBe("layout");
  });

  it("validates pages", async () => {
    const renderer = createPdfLibRenderer();
    const many = Array.from({ length: 501 }, () => ({
      width: 100,
      height: 100,
      ops: [],
    }));
    expect((await fail(renderer.render(many, meta))).code).toBe("too_large");
    const flat = [{ width: 0, height: 100, ops: [] }];
    expect((await fail(renderer.render(flat, meta))).code).toBe("layout");
    const nan = [{ width: 100, height: Number.NaN, ops: [] }];
    expect((await fail(renderer.render(nan, meta))).code).toBe("layout");
  });
});
