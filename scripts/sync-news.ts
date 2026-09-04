#!/usr/bin/env tsx
// Generates src/data/generated/news.json from Google News RSS searches for
// Prof. Balaraman Ravindran. News search is inherently noisier than the
// publications pipeline (no stable identifier like ORCID to filter on), so
// this script is deliberately conservative: an item is kept only when the
// professor's name appears verbatim in the headline, because RSS metadata
// gives us nothing more than a title + link to judge relevance from (no
// article body is fetched or stored — see README.md "News").
//
// news.json is treated as a rolling store, not a fresh snapshot: each run
// merges newly discovered items into whatever was already there, because
// Google News RSS search only returns a recent rolling window and would
// otherwise cause older (still valid) stories to silently disappear.
import { createHash } from "node:crypto";
import { loadEnv } from "./lib/env.js";
import { readJsonIfExists, writeJsonDeterministic } from "./lib/fs-json.js";
import { fetchWithRetry } from "./lib/http.js";
import { normalizeTitle, normalizeUrl, stripHtml } from "./lib/text.js";
import { NewsFile, NewsOverrides, type NewsFile as NewsFileT, type NewsItem } from "../src/lib/schemas.js";

loadEnv();

const OUTPUT_PATH = "src/data/generated/news.json";
const OVERRIDES_PATH = "src/data/news-overrides.json";
const MAX_ITEMS = 100;

const QUERIES = [
  { q: '"Balaraman Ravindran"', matchedBy: "exact-name" },
  { q: '"Balaraman Ravindran" "IIT Madras"', matchedBy: "exact-name+institution" },
  { q: '"B. Ravindran" "IIT Madras"', matchedBy: "short-name+institution" },
];

const INSTITUTION_MARKERS = ["iit madras", "iitm", "wsai", "dsai", "rbcdsai", "wadhwani school"];

function buildRssUrl(query: string): string {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-IN");
  url.searchParams.set("gl", "IN");
  url.searchParams.set("ceid", "IN:en");
  return url.toString();
}

interface RawItem {
  title: string;
  link: string;
  pubDate: string;
  sourceName: string;
}

export function parseRss(xml: string): RawItem[] {
  const items: RawItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
    const sourceName = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "";
    if (title && link) {
      items.push({
        title: decodeXmlEntities(title),
        link: link.trim(),
        pubDate: pubDate.trim(),
        sourceName: decodeXmlEntities(sourceName),
      });
    }
  }
  return items;
}

export function decodeXmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Google News suffixes titles with " - Source Name"; strip it since we already have <source>. */
export function stripSourceSuffix(title: string, sourceName: string): string {
  if (sourceName && title.endsWith(` - ${sourceName}`)) {
    return title.slice(0, -(sourceName.length + 3)).trim();
  }
  return title.replace(/\s+-\s+[^-]+$/, (m) => (m.length < 40 ? m : "")).trim() || title;
}

export function isHighConfidence(title: string): { pass: boolean; matchedBy: string } {
  const lower = title.toLowerCase();
  if (lower.includes("balaraman ravindran")) {
    return { pass: true, matchedBy: "exact-full-name" };
  }
  const hasShortName = /\bb\.?\s*ravindran\b/.test(lower);
  const hasInstitution = INSTITUTION_MARKERS.some((m) => lower.includes(m));
  if (hasShortName && hasInstitution) {
    return { pass: true, matchedBy: "short-name+institution-context" };
  }
  return { pass: false, matchedBy: "" };
}

export function makeId(url: string): string {
  return createHash("sha1").update(normalizeUrl(url)).digest("hex").slice(0, 16);
}

async function fetchManualInclude(url: string): Promise<NewsItem | undefined> {
  try {
    const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 10_000 });
    // Only the <title> tag is read — never the article body — to stay
    // within "avoid storing entire article bodies" / no full-text scraping.
    const html = (await res.text()).slice(0, 100_000);
    const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url;
    const title = stripHtml(decodeXmlEntities(rawTitle)).trim() || url;
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return {
      id: makeId(url),
      title,
      source: hostname,
      publishedAt: new Date().toISOString(),
      url,
      matchedBy: "manual-include",
      verified: true,
    };
  } catch (err) {
    console.warn(`[sync-news] Could not fetch metadata for manually-included URL ${url}:`, (err as Error).message);
    return undefined;
  }
}

async function main() {
  const previous = readJsonIfExists<NewsFileT>(OUTPUT_PATH);
  const overridesRaw = readJsonIfExists<unknown>(OVERRIDES_PATH) ?? {};
  const overridesParsed = NewsOverrides.safeParse(overridesRaw);
  const overrides = overridesParsed.success
    ? overridesParsed.data
    : { excludedUrls: [], includedUrls: [], pinnedIds: [] };
  if (!overridesParsed.success) {
    console.warn(`[sync-news] ${OVERRIDES_PATH} failed validation, ignoring overrides for this run.`);
  }

  const excludedNormalized = new Set(overrides.excludedUrls.map(normalizeUrl));

  const fresh: NewsItem[] = [];
  let anyQuerySucceeded = false;

  for (const { q, matchedBy } of QUERIES) {
    try {
      const res = await fetchWithRetry(buildRssUrl(q), { retries: 2, timeoutMs: 15_000 });
      const xml = await res.text();
      const rawItems = parseRss(xml);
      anyQuerySucceeded = true;
      for (const raw of rawItems) {
        const title = stripSourceSuffix(stripHtml(raw.title), raw.sourceName);
        const confidence = isHighConfidence(title);
        if (!confidence.pass) continue;
        const normalizedUrl = normalizeUrl(raw.link);
        if (excludedNormalized.has(normalizedUrl)) continue;
        const publishedAt = raw.pubDate ? new Date(raw.pubDate).toISOString() : new Date().toISOString();
        fresh.push({
          id: makeId(raw.link),
          title,
          source: raw.sourceName || new URL(raw.link).hostname,
          publishedAt,
          url: raw.link,
          matchedBy: confidence.matchedBy === "exact-full-name" ? confidence.matchedBy : matchedBy,
          verified: true,
        });
      }
    } catch (err) {
      console.warn(`[sync-news] Query failed, skipping (query="${q}"):`, (err as Error).message);
    }
  }

  if (!anyQuerySucceeded) {
    if (previous) {
      console.warn("[sync-news] All Google News RSS queries failed — retaining existing news.json unchanged.");
      writeJsonDeterministic(OUTPUT_PATH, { ...previous, sourceStatus: "stale" } satisfies NewsFileT);
      return;
    }
    console.error("[sync-news] All queries failed and no previous news.json exists. Writing empty placeholder.");
    writeJsonDeterministic(OUTPUT_PATH, {
      generatedAt: new Date().toISOString(),
      sourceStatus: "error",
      count: 0,
      items: [],
    } satisfies NewsFileT);
    process.exitCode = 1;
    return;
  }

  const manualIncludes: NewsItem[] = [];
  for (const url of overrides.includedUrls) {
    if (excludedNormalized.has(normalizeUrl(url))) continue;
    const item = await fetchManualInclude(url);
    if (item) manualIncludes.push(item);
  }

  const merged = new Map<string, NewsItem>();
  for (const item of [...(previous?.items ?? []), ...fresh, ...manualIncludes]) {
    if (excludedNormalized.has(normalizeUrl(item.url))) continue;
    merged.set(item.id, item);
  }

  // Second dedup pass: collapse syndicated duplicates (same headline, different outlet/link).
  const byTitle = new Map<string, NewsItem>();
  for (const item of merged.values()) {
    const key = normalizeTitle(item.title);
    const existing = byTitle.get(key);
    if (!existing || new Date(item.publishedAt) < new Date(existing.publishedAt)) {
      // Keep the earliest-published instance of a syndicated story.
      byTitle.set(key, existing && new Date(existing.publishedAt) <= new Date(item.publishedAt) ? existing : item);
    }
  }

  const pinnedIds = new Set(overrides.pinnedIds);
  let deduped = Array.from(byTitle.values());
  deduped.sort((a, b) => {
    const aPinned = pinnedIds.has(a.id);
    const bPinned = pinnedIds.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  deduped = deduped.slice(0, MAX_ITEMS);

  const file: NewsFileT = {
    generatedAt: new Date().toISOString(),
    sourceStatus: "ok",
    count: deduped.length,
    items: deduped,
  };

  const parsed = NewsFile.safeParse(file);
  if (!parsed.success) {
    console.error("[sync-news] Generated data failed schema validation:", parsed.error.issues);
    process.exitCode = 1;
    return;
  }

  const changed = writeJsonDeterministic(OUTPUT_PATH, parsed.data);
  console.log(
    changed
      ? `[sync-news] Wrote ${deduped.length} news items to ${OUTPUT_PATH}.`
      : `[sync-news] No changes — ${deduped.length} news items already up to date.`,
  );
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("[sync-news] Unexpected failure:", err);
    process.exitCode = 1;
  });
}
