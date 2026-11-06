import { layout, type PageSpec } from "./layout.js";
import { parseDocument } from "./markup.js";
import { createPdfLibRenderer, type PdfMeta, type PdfRenderer } from "./renderers.js";
import { renderTemplate } from "./template.js";

/** Options for {@link generatePdf}. */
export interface GeneratePdfOptions {
  /** Page size, margins and typography. */
  readonly page: PageSpec;
  /** Document metadata. */
  readonly meta: PdfMeta;
  /** Renderer to use; defaults to the pdf-lib renderer. */
  readonly renderer?: PdfRenderer;
  /** Make missing template variables an error. */
  readonly strict?: boolean;
}

/**
 * Renders a template, parses the markup, lays it out and renders the PDF.
 *
 * @param template - Template text (see {@link renderTemplate}).
 * @param data - Data for the template.
 * @param opts - Page, metadata, optional renderer and strict mode.
 * @returns The document bytes.
 * @throws {PdfTemplateError} Any error of the individual steps.
 */
export async function generatePdf(
  template: string,
  data: Record<string, unknown>,
  opts: GeneratePdfOptions,
): Promise<Uint8Array> {
  const markup = renderTemplate(template, data, { strict: opts.strict ?? false });
  const doc = parseDocument(markup);
  const renderer = opts.renderer ?? createPdfLibRenderer();
  const metrics = await renderer.metrics();
  const pages = layout(doc, opts.page, metrics);
  return renderer.render(pages, opts.meta);
}
