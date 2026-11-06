import { PDFDocument, StandardFonts } from "pdf-lib";
import { PdfTemplateError } from "./errors.js";
import type { FontMetrics, LaidOutPage } from "./layout.js";
import { MAX_META_CHARS, MAX_PAGES } from "./limits.js";

/** Document metadata. */
export interface PdfMeta {
  readonly title: string;
  readonly author?: string;
  /** Used for both the creation and the modification date. */
  readonly creationDate: Date;
}

/** Port that measures text and turns laid out pages into bytes. */
export interface PdfRenderer {
  /** Returns the metrics the layout step must use with this renderer. */
  metrics(): Promise<FontMetrics>;
  /** Renders pages to document bytes. */
  render(pages: readonly LaidOutPage[], meta: PdfMeta): Promise<Uint8Array>;
}

/** Options for {@link createPdfLibRenderer}. */
export interface PdfLibRendererOptions {
  /** Draw `?` for characters WinAnsi cannot encode instead of throwing. */
  readonly replaceUnsupported?: boolean;
}

const PRODUCER = "@trysac/pdf-templates";
const WIN_ANSI_EXTRA_CHARS = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const WIN_ANSI_EXTRAS: ReadonlySet<number> = new Set(
  Array.from(WIN_ANSI_EXTRA_CHARS, (char) => char.codePointAt(0) ?? 0),
);

function isWinAnsi(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) {
    return true;
  }
  if (codePoint >= 0xa1 && codePoint <= 0xff) {
    return codePoint !== 0xad;
  }
  return WIN_ANSI_EXTRAS.has(codePoint);
}

function prepareText(text: string, replace: boolean): string {
  let out = "";
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isWinAnsi(codePoint)) {
      out += char;
    } else if (replace) {
      out += "?";
    } else {
      const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
      throw new PdfTemplateError(
        "unsupported_character",
        `Character U+${hex} cannot be encoded in WinAnsi`,
        { codePoint },
      );
    }
  }
  return out;
}

function checkText(value: unknown, name: string): void {
  if (typeof value !== "string") {
    throw new PdfTemplateError("layout", `Metadata ${name} must be a string`);
  }
  if (value.length > MAX_META_CHARS) {
    throw new PdfTemplateError("too_large", `Metadata ${name} is too long`);
  }
}

function validateMeta(meta: PdfMeta): void {
  checkText(meta.title, "title");
  if (meta.author !== undefined) {
    checkText(meta.author, "author");
  }
  const date = meta.creationDate;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new PdfTemplateError("layout", "creationDate must be a valid Date");
  }
}

function validateSize(page: LaidOutPage): void {
  const valid =
    Number.isFinite(page.width) &&
    Number.isFinite(page.height) &&
    page.width > 0 &&
    page.height > 0;
  if (!valid) {
    throw new PdfTemplateError("layout", "Page size must be positive");
  }
}

/**
 * Creates the pdf-lib renderer: standard Helvetica and Helvetica-Bold only,
 * WinAnsi text only, and byte-identical output for identical input (fixed
 * producer and creator, dates taken from the metadata, no object streams).
 *
 * @param opts - `replaceUnsupported` draws `?` for unencodable characters.
 * @returns A renderer.
 */
export function createPdfLibRenderer(opts: PdfLibRendererOptions = {}): PdfRenderer {
  const replace = opts.replaceUnsupported === true;
  return {
    async metrics(): Promise<FontMetrics> {
      const doc = await PDFDocument.create({ updateMetadata: false });
      const regular = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      return {
        widthOf: (text, isBold, size) =>
          (isBold ? bold : regular).widthOfTextAtSize(prepareText(text, replace), size),
      };
    },
    async render(pages, meta): Promise<Uint8Array> {
      validateMeta(meta);
      if (pages.length > MAX_PAGES) {
        throw new PdfTemplateError("too_large", "Too many pages");
      }
      const doc = await PDFDocument.create({ updateMetadata: false });
      const regular = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      doc.setTitle(meta.title);
      if (meta.author !== undefined) {
        doc.setAuthor(meta.author);
      }
      doc.setProducer(PRODUCER);
      doc.setCreator(PRODUCER);
      doc.setCreationDate(meta.creationDate);
      doc.setModificationDate(meta.creationDate);
      for (const spec of pages) {
        validateSize(spec);
        const page = doc.addPage([spec.width, spec.height]);
        for (const op of spec.ops) {
          if (op.kind === "text") {
            page.drawText(prepareText(op.text, replace), {
              x: op.x,
              y: op.y,
              size: op.size,
              font: op.bold ? bold : regular,
            });
          } else {
            page.drawLine({
              start: { x: op.x1, y: op.y1 },
              end: { x: op.x2, y: op.y2 },
              thickness: 0.5,
            });
          }
        }
      }
      return doc.save({ useObjectStreams: false });
    },
  };
}

/**
 * Creates a renderer for tests. Its metrics are `0.5 * size * text.length` and
 * `render` returns the UTF-8 JSON of the laid out pages.
 *
 * @returns A fake renderer.
 */
export function createFakeRenderer(): PdfRenderer {
  return {
    metrics: () =>
      Promise.resolve({
        widthOf: (text: string, _bold: boolean, size: number) => 0.5 * size * text.length,
      }),
    render: (pages) => Promise.resolve(new TextEncoder().encode(JSON.stringify(pages))),
  };
}
