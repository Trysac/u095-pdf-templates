import { clip, PdfTemplateError } from "./errors.js";
import { MAX_PAGES } from "./limits.js";
import type { DocumentModel } from "./markup.js";

/** Page geometry and typography. Every length is in PDF points. */
export interface PageSpec {
  readonly size: "A4" | "Letter";
  readonly margins: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly fontSize: number;
  readonly lineHeight: number;
}

/** Text measurement used by the layout step. */
export interface FontMetrics {
  /** Width in points of `text` at `size`, regular or bold. */
  widthOf(text: string, bold: boolean, size: number): number;
}

/** A positioned run of text; `y` is measured from the bottom of the page. */
export interface TextOp {
  readonly kind: "text";
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly bold: boolean;
  readonly size: number;
}

/** A positioned straight line. */
export interface LineOp {
  readonly kind: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** One drawing operation. */
export type LayoutOp = TextOp | LineOp;

/** A laid out page with its size in points and its drawing operations. */
export interface LaidOutPage {
  readonly width: number;
  readonly height: number;
  readonly ops: readonly LayoutOp[];
}

const PAGE_DIMENSIONS = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
} as const;
const HEADING_SCALE = { 1: 1.6, 2: 1.3 } as const;
const BULLET_MARKER = "•";
const BULLET_INDENT = 1.5;
const EPSILON = 1e-9;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function validateSpec(spec: PageSpec): void {
  if (spec.size !== "A4" && spec.size !== "Letter") {
    throw new PdfTemplateError("layout", "Page size must be A4 or Letter");
  }
  const { top, right, bottom, left } = spec.margins;
  const margins = [top, right, bottom, left];
  if (!margins.every((margin) => Number.isFinite(margin) && margin >= 0)) {
    throw new PdfTemplateError("layout", "Margins must be non-negative");
  }
  if (!Number.isFinite(spec.fontSize) || spec.fontSize <= 0) {
    throw new PdfTemplateError("layout", "fontSize must be positive");
  }
  if (spec.fontSize > 1000) {
    throw new PdfTemplateError("layout", "fontSize is too large");
  }
  if (!Number.isFinite(spec.lineHeight) || spec.lineHeight <= 0) {
    throw new PdfTemplateError("layout", "lineHeight must be positive");
  }
  if (spec.lineHeight > 10) {
    throw new PdfTemplateError("layout", "lineHeight is too large");
  }
}

function wrap(
  text: string,
  bold: boolean,
  size: number,
  maxWidth: number,
  metrics: FontMetrics,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (word === "") {
      continue;
    }
    if (metrics.widthOf(word, bold, size) > maxWidth + EPSILON) {
      throw new PdfTemplateError("layout", `Word is wider than the content width: ${clip(word)}`);
    }
    if (line === "") {
      line = word;
      continue;
    }
    const candidate = `${line} ${word}`;
    if (metrics.widthOf(candidate, bold, size) <= maxWidth + EPSILON) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") {
    lines.push(line);
  }
  return lines;
}

interface Geometry {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly bottom: number;
  readonly lineHeight: number;
}

interface PageState {
  readonly ops: LayoutOp[];
  readonly counts: Map<number, number>;
  first: number;
  lines: number;
}

class Paginator {
  private readonly pages: LaidOutPage[] = [];
  private current: PageState | undefined;
  private readonly geometry: Geometry;

  constructor(geometry: Geometry) {
    this.geometry = geometry;
  }

  placeLine(size: number, build: (y: number) => LayoutOp[]): void {
    let page = this.current ?? this.open();
    let y = this.baseline(page, size);
    if (y < this.geometry.bottom && page.lines > 0) {
      this.breakPage();
      page = this.open();
      y = this.baseline(page, size);
    }
    if (y < this.geometry.bottom) {
      throw new PdfTemplateError("layout", "Content area is too small for a single line");
    }
    page.ops.push(...build(y));
    page.counts.set(size, (page.counts.get(size) ?? 0) + 1);
    if (page.lines === 0) {
      page.first = size;
    }
    page.lines += 1;
  }

  breakPage(): void {
    if (this.current !== undefined) {
      const { width, height } = this.geometry;
      this.pages.push({ width, height, ops: this.current.ops });
      this.current = undefined;
    }
  }

  finish(): LaidOutPage[] {
    this.breakPage();
    if (this.pages.length === 0) {
      const { width, height } = this.geometry;
      this.pages.push({ width, height, ops: [] });
    }
    return this.pages;
  }

  private open(): PageState {
    if (this.pages.length >= MAX_PAGES) {
      throw new PdfTemplateError("too_large", "Too many pages");
    }
    const page: PageState = { ops: [], counts: new Map(), first: 0, lines: 0 };
    this.current = page;
    return page;
  }

  /** Baseline of the next line, from per-size line counts on the page. */
  private baseline(page: PageState, size: number): number {
    const { height, top, lineHeight } = this.geometry;
    const first = page.lines === 0 ? size : page.first;
    let total = size * lineHeight;
    for (const [lineSize, count] of page.counts) {
      total += count * lineSize * lineHeight;
    }
    return round2(height - top - first - (total - first * lineHeight));
  }
}

interface TextStyle {
  readonly size: number;
  readonly bold: boolean;
  readonly x: number;
  readonly width: number;
  readonly bullet?: { readonly marker: string; readonly x: number };
}

function placeText(pager: Paginator, metrics: FontMetrics, text: string, style: TextStyle): void {
  const lines = wrap(text, style.bold, style.size, style.width, metrics);
  for (const [index, content] of lines.entries()) {
    pager.placeLine(style.size, (y) => {
      const ops: LayoutOp[] = [];
      if (index === 0 && style.bullet !== undefined) {
        ops.push({
          kind: "text",
          x: style.bullet.x,
          y,
          text: style.bullet.marker,
          bold: false,
          size: style.size,
        });
      }
      ops.push({
        kind: "text",
        x: style.x,
        y,
        text: content,
        bold: style.bold,
        size: style.size,
      });
      return ops;
    });
  }
}

/**
 * Lays a document out on pages with greedy word wrapping.
 *
 * Coordinates are PDF points measured from the bottom-left. The first baseline
 * of a page is `height - top - size`; every following line is
 * `size * lineHeight` lower. Values are rounded to 2 decimals. A `---` block
 * closes the current page; empty pages are never produced, except that an
 * empty document yields one empty page.
 *
 * @param doc - Parsed document.
 * @param page - Page size, margins and typography.
 * @param metrics - Text measurement.
 * @returns The laid out pages.
 * @throws {PdfTemplateError} `layout` for an invalid page spec or a word wider
 * than the content width, `too_large` beyond 500 pages.
 */
export function layout(doc: DocumentModel, page: PageSpec, metrics: FontMetrics): LaidOutPage[] {
  validateSpec(page);
  const { width, height } = PAGE_DIMENSIONS[page.size];
  const { top, right, bottom, left } = page.margins;
  const base = round2(page.fontSize);
  const contentWidth = width - left - right;
  const indent = round2(base * BULLET_INDENT);
  if (contentWidth <= indent || height - top - bottom <= 0) {
    throw new PdfTemplateError("layout", "Margins leave no room for content");
  }
  const pager = new Paginator({
    width,
    height,
    top,
    bottom,
    lineHeight: page.lineHeight,
  });
  const leftX = round2(left);

  for (const block of doc.blocks) {
    if (block.kind === "pageBreak") {
      pager.breakPage();
    } else if (block.kind === "heading") {
      const size = round2(base * HEADING_SCALE[block.level]);
      const style = { size, bold: true, x: leftX, width: contentWidth };
      placeText(pager, metrics, block.text, style);
    } else if (block.kind === "paragraph") {
      const style = { size: base, bold: false, x: leftX, width: contentWidth };
      placeText(pager, metrics, block.text, style);
    } else {
      const style = {
        size: base,
        bold: false,
        x: round2(left + indent),
        width: contentWidth - indent,
        bullet: { marker: BULLET_MARKER, x: leftX },
      };
      placeText(pager, metrics, block.text, style);
    }
  }
  return pager.finish();
}
