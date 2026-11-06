import { clip, PdfTemplateError } from "./errors.js";
import {
  MAX_ITERATIONS,
  MAX_MARKUP_CHARS,
  MAX_NESTING_DEPTH,
  MAX_PATH_SEGMENTS,
  MAX_TEMPLATE_BYTES,
} from "./limits.js";
import { ESCAPE_PREFIX } from "./markup.js";

/** Options for {@link renderTemplate}. */
export interface RenderOptions {
  /** Throw `missing_variable` for absent values instead of printing nothing. */
  readonly strict?: boolean;
}

interface TextNode {
  readonly kind: "text";
  readonly value: string;
}

interface VarNode {
  readonly kind: "var";
  readonly raw: string;
  readonly path: readonly string[];
}

interface EachNode {
  readonly kind: "each";
  readonly raw: string;
  readonly path: readonly string[];
  readonly body: readonly TemplateNode[];
}

interface IfNode {
  readonly kind: "if";
  readonly raw: string;
  readonly path: readonly string[];
  readonly whenTrue: readonly TemplateNode[];
  readonly whenFalse: readonly TemplateNode[];
}

type TemplateNode = TextNode | VarNode | EachNode | IfNode;

interface Frame {
  readonly kind: "root" | "each" | "if";
  readonly line: number;
  readonly raw: string;
  readonly path: readonly string[];
  readonly body: TemplateNode[];
  readonly otherwise: TemplateNode[];
  inElse: boolean;
}

const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
const SEGMENT = /^(?:[A-Za-z_$][A-Za-z0-9_$]*|[0-9]+)$/;
const BLOCK_OPEN = /^#(each|if)\s+(\S+)$/;
const MISSING = Symbol("missing");

function syntax(message: string, line: number): PdfTemplateError {
  return new PdfTemplateError("template_syntax", message, { line });
}

function countLines(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      count += 1;
    }
  }
  return count;
}

function parsePath(raw: string, line: number): string[] {
  const segments = raw.split(".");
  if (segments.length > MAX_PATH_SEGMENTS) {
    throw new PdfTemplateError("too_deep", `Path has more than ${MAX_PATH_SEGMENTS} segments`, {
      line,
      path: clip(raw),
    });
  }
  for (const segment of segments) {
    if (FORBIDDEN_SEGMENTS.has(segment)) {
      throw new PdfTemplateError("forbidden_path", `Forbidden path segment: ${clip(segment)}`, {
        line,
        path: raw,
      });
    }
  }
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) {
      throw syntax(`Invalid tag: ${clip(raw)}`, line);
    }
  }
  return segments;
}

function newFrame(kind: Frame["kind"], line: number, raw: string, path: readonly string[]): Frame {
  return { kind, line, raw, path, body: [], otherwise: [], inElse: false };
}

function current(frames: Frame[]): Frame {
  return frames[frames.length - 1] as Frame;
}

function sinkOf(frame: Frame): TemplateNode[] {
  return frame.inElse ? frame.otherwise : frame.body;
}

function closeFrame(frame: Frame): TemplateNode {
  if (frame.kind === "each") {
    return {
      kind: "each",
      raw: frame.raw,
      path: frame.path,
      body: frame.body,
    };
  }
  return {
    kind: "if",
    raw: frame.raw,
    path: frame.path,
    whenTrue: frame.body,
    whenFalse: frame.otherwise,
  };
}

function applyTag(frames: Frame[], tag: string, line: number): void {
  const frame = current(frames);
  const block = BLOCK_OPEN.exec(tag);
  if (block !== null) {
    if (frames.length - 1 >= MAX_NESTING_DEPTH) {
      throw new PdfTemplateError("too_deep", "Blocks are nested too deeply", { line });
    }
    const raw = block[2] ?? "";
    const kind = block[1] === "each" ? "each" : "if";
    frames.push(newFrame(kind, line, raw, parsePath(raw, line)));
    return;
  }
  if (tag === "/each" || tag === "/if") {
    const expected = tag === "/each" ? "each" : "if";
    if (frame.kind !== expected) {
      throw syntax(`Unexpected ${tag}`, line);
    }
    frames.pop();
    sinkOf(current(frames)).push(closeFrame(frame));
    return;
  }
  if (tag === "else") {
    if (frame.kind !== "if" || frame.inElse) {
      throw syntax("Unexpected else", line);
    }
    frame.inElse = true;
    return;
  }
  sinkOf(frame).push({ kind: "var", raw: tag, path: parsePath(tag, line) });
}

function parse(template: string): TemplateNode[] {
  const root = newFrame("root", 1, "", []);
  const frames: Frame[] = [root];
  let position = 0;
  let line = 1;

  while (position < template.length) {
    const open = template.indexOf("{{", position);
    if (open === -1) {
      sinkOf(current(frames)).push({
        kind: "text",
        value: template.slice(position),
      });
      break;
    }
    if (open > position) {
      const chunk = template.slice(position, open);
      sinkOf(current(frames)).push({ kind: "text", value: chunk });
      line += countLines(chunk);
    }
    const close = template.indexOf("}}", open + 2);
    if (close === -1) {
      throw syntax("Unclosed tag", line);
    }
    const inner = template.slice(open + 2, close);
    if (inner.includes("{") || inner.includes("}")) {
      throw syntax("Unexpected brace inside a tag", line);
    }
    const tagLine = line;
    line += countLines(inner);
    position = close + 2;
    applyTag(frames, inner.trim(), tagLine);
  }

  if (frames.length > 1) {
    throw syntax("Unclosed block", current(frames).line);
  }
  return root.body;
}

interface RenderState {
  readonly strict: boolean;
  readonly root: unknown;
  readonly out: string[];
  length: number;
  lineBlank: boolean;
  iterations: number;
}

function emit(state: RenderState, text: string): void {
  if (text === "") {
    return;
  }
  state.length += text.length;
  if (state.length > MAX_MARKUP_CHARS) {
    throw new PdfTemplateError("too_large", "Rendered output is too large");
  }
  state.out.push(text);
  const newline = text.lastIndexOf("\n");
  if (newline === -1) {
    state.lineBlank = state.lineBlank && text.trim() === "";
  } else {
    state.lineBlank = text.slice(newline + 1).trim() === "";
  }
}

function sanitize(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    out += code === 10 || code === 13 || code === 9 ? " " : char;
  }
  return out;
}

function emitValue(state: RenderState, value: string): void {
  let text = sanitize(value);
  const first = text.trimStart().charAt(0);
  const structural = first === "#" || first === "-" || first === ESCAPE_PREFIX;
  if (state.lineBlank && structural) {
    text = `${ESCAPE_PREFIX}${text}`;
  }
  emit(state, text);
}

function lookup(root: unknown, scope: unknown, path: readonly string[]): unknown {
  const relative = path[0] === "this";
  let value: unknown = relative ? scope : root;
  for (const segment of relative ? path.slice(1) : path) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, segment)) {
      return MISSING;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function failIfStrict(state: RenderState, raw: string): void {
  if (state.strict) {
    throw new PdfTemplateError("missing_variable", `Missing variable: ${clip(raw)}`, { path: raw });
  }
}

function stringify(value: unknown, raw: string): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  throw new PdfTemplateError("missing_variable", `Value is not printable: ${clip(raw)}`, {
    path: raw,
  });
}

function isTruthy(value: unknown): boolean {
  if (value === MISSING) {
    return false;
  }
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function renderEach(state: RenderState, node: EachNode, scope: unknown): void {
  const value = lookup(state.root, scope, node.path);
  if (value === MISSING) {
    failIfStrict(state, node.raw);
    return;
  }
  if (!Array.isArray(value)) {
    return;
  }
  const items: readonly unknown[] = value;
  if (state.iterations + items.length > MAX_ITERATIONS) {
    throw new PdfTemplateError("too_large", "Too many each iterations");
  }
  state.iterations += items.length;
  for (const item of items) {
    renderNodes(state, node.body, item);
  }
}

function renderNodes(state: RenderState, nodes: readonly TemplateNode[], scope: unknown): void {
  for (const node of nodes) {
    if (node.kind === "text") {
      emit(state, node.value);
    } else if (node.kind === "var") {
      const value = lookup(state.root, scope, node.path);
      if (value === MISSING) {
        failIfStrict(state, node.raw);
      } else {
        emitValue(state, stringify(value, node.raw));
      }
    } else if (node.kind === "each") {
      renderEach(state, node, scope);
    } else {
      const value = lookup(state.root, scope, node.path);
      renderNodes(state, isTruthy(value) ? node.whenTrue : node.whenFalse, scope);
    }
  }
}

/**
 * Renders a safe Mustache-subset template.
 *
 * Tags: `{{path}}`, `{{#each path}}...{{/each}}` (use `this` for the item) and
 * `{{#if path}}...{{else}}...{{/if}}`. Paths are dotted, use own properties
 * only and have at most 10 segments. Values are stringified; CR, LF and tab
 * become spaces, and a value that begins a line with `#`, `-` or a backslash
 * gets a backslash prefix so data can never create document structure.
 *
 * @param template - Template text, at most 256 KiB.
 * @param data - Data made available to the template.
 * @param opts - `strict` makes a missing variable an error.
 * @returns The rendered markup.
 * @throws {PdfTemplateError} `template_syntax`, `missing_variable`,
 * `forbidden_path`, `too_large` or `too_deep`.
 */
export function renderTemplate(
  template: string,
  data: Record<string, unknown>,
  opts: RenderOptions = {},
): string {
  if (typeof template !== "string") {
    throw syntax("Template must be a string", 1);
  }
  if (
    template.length > MAX_TEMPLATE_BYTES ||
    new TextEncoder().encode(template).length > MAX_TEMPLATE_BYTES
  ) {
    throw new PdfTemplateError("too_large", "Template is too large");
  }
  const state: RenderState = {
    strict: opts.strict === true,
    root: data,
    out: [],
    length: 0,
    lineBlank: true,
    iterations: 0,
  };
  renderNodes(state, parse(template), data);
  return state.out.join("");
}
