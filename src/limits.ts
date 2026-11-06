/** Maximum template size in UTF-8 bytes (256 KiB). */
export const MAX_TEMPLATE_BYTES = 262_144;

/** Maximum nesting depth of `each` and `if` blocks. */
export const MAX_NESTING_DEPTH = 16;

/** Maximum number of `each` iterations in one render, nested loops included. */
export const MAX_ITERATIONS = 10_000;

/** Maximum number of segments in a dotted path. */
export const MAX_PATH_SEGMENTS = 10;

/** Maximum size of rendered markup, in UTF-16 code units (4 MiB). */
export const MAX_MARKUP_CHARS = 4_194_304;

/** Maximum number of pages in one document. */
export const MAX_PAGES = 500;

/** Maximum length of a metadata string such as the title. */
export const MAX_META_CHARS = 1_000;
