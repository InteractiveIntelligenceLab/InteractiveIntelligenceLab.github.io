#!/usr/bin/env tsx
// Checks every external link the site actually renders and reports broken
// ones. Run manually (`npm run check-links`) or in CI via
// .github/workflows/link-check.yml. See spec section 7.
//
// "Critical" links (institutional nav/footer links) fail the run when
// broken. Bulk data links (people/publication/news URLs, sourced from
// third-party sites we don't control) are reported but only ever warn —
// one dead conference-proceedings mirror shouldn't block every deploy.
//
// Checks run with bounded concurrency (there can easily be 500+ publication/
// news/people links) and try a cheap HEAD request first, falling back to GET
// only for servers that reject HEAD (405/501) — full sequential GETs would
// make this take many minutes.
import { readFileSync, writeFileSync } from "node:fs";
import { fetchWithRetry, HttpError } from "./lib/http.js";
import type { SiteConfig } from "../src/lib/schemas.js";
import type { PeopleFile, PublicationsFile, NewsFile } from "../src/lib/schemas.js";

const CONCURRENCY = 12;

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

interface LinkCheckResult {
  url: string;
  critical: boolean;
  context: string;
  ok: boolean;
  status?: number;
  error?: string;
}

// Several publisher sites (ACM, IEEE, etc.) 403 bot-like requests that have
// no User-Agent at all, even though the link works fine for a real visitor —
// sending a normal browser UA cuts down on that specific false positive.
const CHECK_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (compatible; IIL-LinkChecker/1.0; +https://iil.github.io)",
};

async function checkUrl(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 12_000, method: "HEAD", headers: CHECK_HEADERS });
    return { ok: true, status: res.status };
  } catch (headErr) {
    if (headErr instanceof HttpError && (headErr.status === 405 || headErr.status === 501 || headErr.status === 403)) {
      try {
        const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 12_000, method: "GET", headers: CHECK_HEADERS });
        return { ok: true, status: res.status };
      } catch (getErr) {
        if (getErr instanceof HttpError) return { ok: false, status: getErr.status, error: getErr.message };
        return { ok: false, error: (getErr as Error).message };
      }
    }
    if (headErr instanceof HttpError) return { ok: false, status: headErr.status, error: headErr.message };
    return { ok: false, error: (headErr as Error).message };
  }
}

/** Runs `items` through `worker` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}

async function main() {
  const siteConfig = loadJson<SiteConfig>("src/data/site-config.json");
  const people = loadJson<PeopleFile>("src/data/generated/people.json");
  const publications = loadJson<PublicationsFile>("src/data/generated/publications.json");
  const news = loadJson<NewsFile>("src/data/generated/news.json");

  const critical: { url: string; context: string }[] = [
    { url: siteConfig.links.iitm, context: "site-config.links.iitm" },
    { url: siteConfig.links.dsai, context: "site-config.links.dsai" },
    { url: siteConfig.links.postdoc, context: "site-config.links.postdoc" },
  ];

  const bulk: { url: string; context: string }[] = [];
  for (const p of people.people) {
    if (p.professionalUrl) bulk.push({ url: p.professionalUrl, context: `people:${p.slug}` });
  }
  for (const pub of publications.items) {
    bulk.push({ url: pub.url, context: `publication:${pub.id}` });
    if (pub.oaUrl) bulk.push({ url: pub.oaUrl, context: `publication-oa:${pub.id}` });
  }
  for (const item of news.items) {
    bulk.push({ url: item.url, context: `news:${item.id}` });
  }

  console.log(`[check-links] Checking ${critical.length} critical link(s)...`);
  const criticalResults = await mapWithConcurrency(critical, CONCURRENCY, async ({ url, context }) => {
    const r = await checkUrl(url);
    console.log(`  ${r.ok ? "OK  " : "FAIL"} ${r.status ?? "-"}  ${context} -> ${url}`);
    return { url, context, critical: true, ...r } satisfies LinkCheckResult;
  });

  console.log(`[check-links] Checking ${bulk.length} bulk data link(s) (concurrency=${CONCURRENCY})...`);
  let checked = 0;
  const bulkResults = await mapWithConcurrency(bulk, CONCURRENCY, async ({ url, context }) => {
    const r = await checkUrl(url);
    checked++;
    if (!r.ok) console.log(`  WARN ${r.status ?? "-"}  ${context} -> ${url}`);
    if (checked % 50 === 0) console.log(`  ...${checked}/${bulk.length} checked`);
    return { url, context, critical: false, ...r } satisfies LinkCheckResult;
  });

  const results = [...criticalResults, ...bulkResults];
  writeFileSync("link-check-report.json", JSON.stringify(results, null, 2) + "\n", "utf-8");

  const brokenCritical = results.filter((r) => r.critical && !r.ok);
  const brokenBulk = results.filter((r) => !r.critical && !r.ok);
  console.log(
    `\n[check-links] ${results.length} checked — ${brokenCritical.length} critical failure(s), ${brokenBulk.length} bulk warning(s). Full report: link-check-report.json`,
  );

  if (brokenCritical.length > 0) {
    console.error("[check-links] Critical link(s) broken — failing.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[check-links] Unexpected failure:", err);
  process.exit(1);
});
