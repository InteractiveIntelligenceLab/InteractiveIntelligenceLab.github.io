// Small text-normalization helpers shared by the publications and news
// dedup logic, and by anything sanitizing free-text pulled from Google
// Sheets / external APIs before it reaches page templates.

/**
 * Some upstream sources (observed: OpenAlex titles sourced from arXiv) embed
 * a literal two-character `\n` (backslash + letter n) where the original
 * had a line break, rather than an actual newline — e.g. "...Basis in\n
 * Reinforcement Learning". A plain non-alphanumeric collapse leaves the
 * "n" behind as a stray token ("in n reinforcement"), which silently broke
 * title-based dedup between a preprint and its later published version.
 * Strip these (and real control whitespace, for good measure) before any
 * other normalization.
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/\\[nrt]/g, " ")
    .replace(/[\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercases, strips punctuation/diacritics-insensitive noise, collapses whitespace. */
export function normalizeTitle(title: string): string {
  return cleanTitle(title)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Defense-in-depth: strips any HTML tags from text sourced outside the repo
 * (Sheet cells, API fields) before it is ever written to a generated JSON
 * file. Astro escapes text content by default, but generated JSON may also
 * be consumed by client-side script (search/filtering), so we sanitize at
 * the source rather than relying solely on the render layer.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Strip common tracking params so syndicated/duplicate links collapse.
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "gclid"];
    for (const p of trackingParams) u.searchParams.delete(p);
    let normalized = u.toString();
    if (normalized.endsWith("/") && u.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.trim();
  }
}
