import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

const page: api.PageSpec = {
  size: "A4",
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
  fontSize: 12,
  lineHeight: 1.2,
};
const meta: api.PdfMeta = {
  title: "Greeting",
  creationDate: new Date("2024-01-02T03:04:05Z"),
};

describe("public API", () => {
  it("exposes the documented value exports", () => {
    expect(Object.keys(api).sort()).toEqual([
      "PdfTemplateError",
      "createFakeRenderer",
      "createPdfLibRenderer",
      "generatePdf",
      "layout",
      "parseDocument",
      "renderTemplate",
    ]);
  });

  it("runs the whole pipeline with the fake renderer", async () => {
    const renderer = api.createFakeRenderer();
    const bytes = await api.generatePdf(
      "Hello {{name}}",
      { name: "Ana" },
      { page, meta, renderer },
    );
    const json = new TextDecoder().decode(bytes);
    const pages = JSON.parse(json) as api.LaidOutPage[];
    expect(pages).toHaveLength(1);
    expect(pages[0]?.ops[0]).toEqual({
      kind: "text",
      x: 72,
      y: 757.89,
      text: "Hello Ana",
      bold: false,
      size: 12,
    });
  });

  it("exposes error codes through PdfTemplateError", () => {
    const error = new api.PdfTemplateError("layout", "x".repeat(500));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PdfTemplateError");
    expect(error.code).toBe("layout");
    expect(error.message.length).toBeLessThanOrEqual(200);
    expect(error.line).toBeUndefined();
  });
});
