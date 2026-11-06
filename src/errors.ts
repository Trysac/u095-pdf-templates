/** Stable, machine-readable error codes raised by this library. */
export type PdfTemplateErrorCode =
  | "template_syntax"
  | "missing_variable"
  | "forbidden_path"
  | "layout"
  | "unsupported_character"
  | "too_large"
  | "too_deep";

/** Optional context attached to a {@link PdfTemplateError}. */
export interface PdfTemplateErrorDetails {
  /** 1-based template line of the offending tag. */
  readonly line?: number;
  /** Variable path that caused the error. */
  readonly path?: string;
  /** Unicode code point that cannot be encoded. */
  readonly codePoint?: number;
}

const MAX_MESSAGE_CHARS = 200;

/**
 * Base error of the library. Branch on {@link PdfTemplateError.code}, never on
 * the message text.
 */
export class PdfTemplateError extends Error {
  /** Stable machine-readable code. */
  readonly code: PdfTemplateErrorCode;
  /** 1-based template line, when known. */
  readonly line: number | undefined;
  /** Variable path, when relevant. */
  readonly path: string | undefined;
  /** Unicode code point, for `unsupported_character`. */
  readonly codePoint: number | undefined;

  constructor(code: PdfTemplateErrorCode, message: string, details: PdfTemplateErrorDetails = {}) {
    super(message.slice(0, MAX_MESSAGE_CHARS));
    this.name = "PdfTemplateError";
    this.code = code;
    this.line = details.line;
    this.path = details.path;
    this.codePoint = details.codePoint;
  }
}

/** Shortens untrusted text before it is placed in an error message. */
export function clip(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
