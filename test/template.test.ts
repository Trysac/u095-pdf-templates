import { describe, expect, it } from "vitest";
import { PdfTemplateError, renderTemplate } from "../src/index.js";

function fail(run: () => unknown): PdfTemplateError {
  try {
    run();
  } catch (error) {
    if (error instanceof PdfTemplateError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a PdfTemplateError");
}

function codeOf(run: () => unknown): string {
  return fail(run).code;
}

describe("renderTemplate blocks", () => {
  it("renders variables, each and if", () => {
    const template =
      "Hi {{name}}{{#each items}} [{{this}}]{{/each}}{{#if vip}} VIP{{else}} -{{/if}}";
    const data = { name: "Ana", items: ["a", "b"], vip: 0 };
    expect(renderTemplate(template, data)).toBe("Hi Ana [a] [b] -");
  });

  it("treats 0, empty string, false, null, undefined and [] as falsy", () => {
    const template = "{{#if v}}yes{{else}}no{{/if}}";
    for (const v of [0, "", false, null, undefined, []]) {
      expect(renderTemplate(template, { v })).toBe("no");
    }
    for (const v of [1, "x", true, ["x"], {}]) {
      expect(renderTemplate(template, { v })).toBe("yes");
    }
    expect(renderTemplate(template, {})).toBe("no");
    expect(renderTemplate(template, {}, { strict: true })).toBe("no");
  });

  it("renders the truthy branch without else", () => {
    expect(renderTemplate("{{#if a}}x{{/if}}", { a: true })).toBe("x");
    expect(renderTemplate("{{#if a}}x{{/if}}", { a: false })).toBe("");
  });

  it("handles empty arrays, nested each and objects", () => {
    expect(renderTemplate("{{#each items}}x{{/each}}", { items: [] })).toBe("");
    const nested = "{{#each rows}}[{{#each this}}{{this}}{{/each}}]{{/each}}";
    expect(renderTemplate(nested, { rows: [[1, 2], [3]] })).toBe("[12][3]");
    const people = "{{#each people}}{{this.name}};{{/each}}";
    const data = { people: [{ name: "Ana" }, { name: "Bo" }] };
    expect(renderTemplate(people, data)).toBe("Ana;Bo;");
    expect(renderTemplate("{{this.name}}", { name: "x" })).toBe("x");
  });

  it("treats a missing or non-array each value as empty", () => {
    expect(renderTemplate("{{#each a}}x{{/each}}", {})).toBe("");
    expect(renderTemplate("{{#each a}}x{{/each}}", { a: "str" })).toBe("");
    const strict = { strict: true };
    const error = fail(() => renderTemplate("{{#each a}}x{{/each}}", {}, strict));
    expect(error.code).toBe("missing_variable");
    expect(error.path).toBe("a");
  });

  it("reads array indexes and tolerates spaces in tags", () => {
    expect(renderTemplate("{{items.0}}", { items: ["z"] })).toBe("z");
    expect(renderTemplate("{{ name }}", { name: "Ana" })).toBe("Ana");
  });
});

describe("renderTemplate values", () => {
  it("throws missing_variable when strict and renders nothing otherwise", () => {
    const error = fail(() => renderTemplate("{{a.b}}", {}, { strict: true }));
    expect(error.code).toBe("missing_variable");
    expect(error.path).toBe("a.b");
    const deep = fail(() => renderTemplate("{{a.b}}", { a: {} }, { strict: true }));
    expect(deep.path).toBe("a.b");
    expect(renderTemplate("{{a.b}}", {})).toBe("");
    expect(renderTemplate("{{a.b}}", {}, { strict: false })).toBe("");
  });

  it("counts inherited keys and string properties as missing", () => {
    const strict = { strict: true };
    const error = fail(() => renderTemplate("{{toString}}", {}, strict));
    expect(error.code).toBe("missing_variable");
    expect(renderTemplate("{{toString}}", {})).toBe("");
    expect(renderTemplate("{{a.length}}", { a: "abc" })).toBe("");
    expect(codeOf(() => renderTemplate("{{a.length}}", { a: "abc" }, strict))).toBe(
      "missing_variable",
    );
  });

  it("stringifies scalars and keeps null and undefined empty", () => {
    const data = { n: 5, b: true, z: null, u: undefined, big: 10n };
    const template = "{{n}} {{b}} {{z}} {{u}} {{big}}";
    expect(renderTemplate(template, data, { strict: true })).toBe("5 true   10");
  });

  it("rejects values that are not printable", () => {
    for (const o of [{}, [], () => 1]) {
      const error = fail(() => renderTemplate("{{o}}", { o }));
      expect(error.code).toBe("missing_variable");
      expect(error.path).toBe("o");
    }
  });

  it("turns CR, LF and tab into spaces", () => {
    expect(renderTemplate("{{v}}", { v: "a\tb\r\nc" })).toBe("a b  c");
  });

  it("prefixes a backslash when a value starts a line", () => {
    const bs = String.fromCharCode(92);
    expect(renderTemplate("{{v}}", { v: "-5" })).toBe(`${bs}-5`);
    expect(renderTemplate("x {{v}}", { v: "-5" })).toBe("x -5");
    expect(renderTemplate("a\n{{v}}", { v: "# h" })).toBe(`a\n${bs}# h`);
    expect(renderTemplate("{{v}}", { v: `${bs}x` })).toBe(`${bs}${bs}x`);
    expect(renderTemplate("  {{v}}", { v: "#" })).toBe(`  ${bs}#`);
    expect(renderTemplate("{{e}}{{v}}", { e: "", v: "#a" })).toBe(`${bs}#a`);
    expect(renderTemplate("{{v}}", { v: "plain" })).toBe("plain");
  });

  it("does not evaluate tags that appear inside data", () => {
    const data = { v: "{{secret}}", secret: "leak" };
    expect(renderTemplate("{{v}}", data)).toBe("{{secret}}");
  });
});

describe("renderTemplate syntax and paths", () => {
  it("rejects triple braces and unclosed tags with a line", () => {
    const triple = fail(() => renderTemplate("{{{x}}}", { x: 1 }));
    expect(triple.code).toBe("template_syntax");
    expect(triple.line).toBe(1);
    const open = fail(() => renderTemplate("{{name", { name: "a" }));
    expect(open.code).toBe("template_syntax");
    expect(open.line).toBe(1);
    expect(fail(() => renderTemplate("a\nb\n{{name", {})).line).toBe(3);
  });

  it("reports the line of an unclosed block", () => {
    const error = fail(() => renderTemplate("x\n{{#if a}}", { a: 1 }));
    expect(error.code).toBe("template_syntax");
    expect(error.line).toBe(2);
  });

  it("rejects malformed and unknown tags", () => {
    const bad = [
      "{{}}",
      "{{/if}}",
      "{{else}}",
      "{{#if a}}",
      "{{#each a}}{{/if}}",
      "{{#if a}}{{else}}{{else}}{{/if}}",
      "{{#each}}",
      "{{>partial}}",
      "{{a..b}}",
      "{{a b}}",
      "{{#if a}}x{{/each}}",
      "{{#each a}}{{else}}{{/each}}",
    ];
    for (const template of bad) {
      expect(codeOf(() => renderTemplate(template, { a: 1 }))).toBe("template_syntax");
    }
  });

  it("treats a lone brace and a trailing brace as text", () => {
    expect(renderTemplate("{{a}}}", { a: "v" })).toBe("v}");
    expect(renderTemplate("{a} { b }", {})).toBe("{a} { b }");
  });

  it("throws forbidden_path for dangerous segments", () => {
    const templates = [
      "{{__proto__}}",
      "{{a.constructor}}",
      "{{prototype}}",
      "{{#each constructor}}x{{/each}}",
      "{{#if a.__proto__}}x{{/if}}",
      "{{this.__proto__.x}}",
    ];
    for (const template of templates) {
      expect(codeOf(() => renderTemplate(template, { a: {} }))).toBe("forbidden_path");
    }
    expect(codeOf(() => renderTemplate("{{__proto__}}", {}, { strict: true }))).toBe(
      "forbidden_path",
    );
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it("limits paths to 10 segments", () => {
    const ten = Array.from({ length: 10 }, () => "a").join(".");
    const eleven = `${ten}.a`;
    expect(renderTemplate(`{{${ten}}}`, {})).toBe("");
    expect(codeOf(() => renderTemplate(`{{${eleven}}}`, {}))).toBe("too_deep");
  });
});

describe("renderTemplate limits", () => {
  it("rejects a template of 262_145 bytes", () => {
    const error = fail(() => renderTemplate("a".repeat(262_145), {}));
    expect(error.code).toBe("too_large");
    expect(renderTemplate("a".repeat(262_144), {})).toHaveLength(262_144);
  });

  it("counts bytes, not characters", () => {
    const wide = "\u00e9".repeat(131_073);
    expect(codeOf(() => renderTemplate(wide, {}))).toBe("too_large");
  });

  it("allows blocks nested 16 deep and rejects 17", () => {
    const nest = (depth: number): string =>
      `${"{{#if a}}".repeat(depth)}x${"{{/if}}".repeat(depth)}`;
    expect(renderTemplate(nest(16), { a: true })).toBe("x");
    expect(codeOf(() => renderTemplate(nest(17), { a: true }))).toBe("too_deep");
    const each = "{{#each a}}".repeat(17) + "{{/each}}".repeat(17);
    expect(codeOf(() => renderTemplate(each, { a: [] }))).toBe("too_deep");
  });

  it("caps the total number of each iterations at 10_000", () => {
    const template = "{{#each a}}x{{/each}}";
    const ok = renderTemplate(template, { a: new Array(10_000).fill(1) });
    expect(ok).toHaveLength(10_000);
    const over = { a: new Array(10_001).fill(1) };
    expect(codeOf(() => renderTemplate(template, over))).toBe("too_large");
    const nested = "{{#each a}}{{#each a}}x{{/each}}{{/each}}";
    const grid = { a: new Array(101).fill(1) };
    expect(codeOf(() => renderTemplate(nested, grid))).toBe("too_large");
  });

  it("caps the rendered output size", () => {
    const template = `{{#each a}}${"x".repeat(1000)}{{/each}}`;
    const data = { a: new Array(5000).fill(0) };
    expect(codeOf(() => renderTemplate(template, data))).toBe("too_large");
  });

  it("rejects a template that is not a string", () => {
    const bad = 42 as unknown as string;
    expect(codeOf(() => renderTemplate(bad, {}))).toBe("template_syntax");
  });
});
