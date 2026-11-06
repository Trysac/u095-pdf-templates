/**
 * Public entry point of @trysac/pdf-templates.
 *
 * Safe text templates, a minimal markup, a pure layout engine and a
 * deterministic pdf-lib renderer behind a small port.
 */

export type {
  PdfTemplateErrorCode,
  PdfTemplateErrorDetails,
} from "./errors.js";
export { PdfTemplateError } from "./errors.js";
export type { GeneratePdfOptions } from "./generate.js";
export { generatePdf } from "./generate.js";
export type {
  FontMetrics,
  LaidOutPage,
  LayoutOp,
  LineOp,
  PageSpec,
  TextOp,
} from "./layout.js";
export { layout } from "./layout.js";
export type { Block, DocumentModel } from "./markup.js";
export { parseDocument } from "./markup.js";
export type {
  PdfLibRendererOptions,
  PdfMeta,
  PdfRenderer,
} from "./renderers.js";
export { createFakeRenderer, createPdfLibRenderer } from "./renderers.js";
export type { RenderOptions } from "./template.js";
export { renderTemplate } from "./template.js";
