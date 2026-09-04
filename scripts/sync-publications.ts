#!/usr/bin/env tsx
// Generates src/data/generated/publications.json from OpenAlex (primary) and
// DBLP (secondary cross-check/fallback), for Prof. Balaraman Ravindran,
// identified by stable identifiers (ORCID / DBLP PID) rather than name
// matching. See README.md "Publications" for how to run this manually.
//
// Failure policy (spec section 21/24/41): if OpenAlex fails outright, or
// returns nothing, the previously-generated publications.json is left in
// place untouched rather than being overwritten with an empty file. If DBLP
// fails, we simply skip the cross-check step and continue with OpenAlex data.
import { loadEnv } from "./lib/env.js";
import { readJsonIfExists, writeJsonDeterministic } from "./lib/fs-json.js";
import { fetchAuthorByOrcid, fetchAllWorksForAuthor, type OpenAlexWork } from "./lib/openalex.js";
import { fetchDblpRecords, type DblpRecord } from "./lib/dblp.js";
import { normalizeTitle, cleanTitle } from "./lib/text.js";
import { Publication, PublicationsFile, type PublicationsFile as PublicationsFileT } from "../src/lib/schemas.js";

loadEnv();

const ORCID = "0000-0002-5364-7639"; // Prof. Balaraman Ravindran — stable identity, not name matching
const DBLP_PID = "69/2281";
const OUTPUT_PATH = "src/data/generated/publications.json";

// OpenAlex's author-disambiguation for A5009374923 (the ORCID-matched author
// record) is contaminated with ~30 unrelated 1975-2004 parasitology/
// immunology papers by a different, unrelated "B Ravindran" — confirmed by
// inspecting their `raw_author_name` ("B Ravindran", no institution) and
// topics (Malaria Research and Control, etc.), completely disjoint from
// Prof. Balaraman Ravindran's CS/ML fields. ORCID/OpenAlex identity is still
// the right approach per spec (far better than name matching), but a topic
// sanity check is needed on top of it. This denylist is a documented,
// intentional exception — see docs/legacy-content-map.md.
const UNRELATED_TOPIC_KEYWORDS = [
  "malaria",
  "filaria",
  "immun",
  "parasit",
  "tropical medicine",
  "vaccine",
  "antibod",
  "cryoglobulin",
  "rheumatoid",
  "helminth",
  "trypsin",
  "syphilis",
  "treponema",
  "hemagglutination",
  "virology",
  "microbiology",
  "serolog",
  "leucocyte",
  "plasmodium",
];

export function isUnrelatedField(work: OpenAlexWork): boolean {
  const topics = [
    work.primary_topic?.display_name ?? "",
    ...work.concepts.slice(0, 5).map((c) => c.display_name),
  ]
    .join(" ")
    .toLowerCase();
  return UNRELATED_TOPIC_KEYWORDS.some((kw) => topics.includes(kw));
}

const VALID_TYPES = new Set([
  "article",
  "conference-paper",
  "preprint",
  "book-chapter",
  "book",
  "dataset",
]);

export function mapType(openAlexType: string | null): Publication["type"] {
  if (openAlexType && VALID_TYPES.has(openAlexType)) {
    return openAlexType as Publication["type"];
  }
  return "other";
}

export function normalizeDoi(doi: string): string {
  return doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
}

function workToPublication(work: OpenAlexWork): Publication | undefined {
  const title = cleanTitle(work.title ?? work.display_name ?? "");
  if (!title) return undefined;

  const authors = work.authorships.map((a) => a.author.display_name).filter(Boolean);
  if (authors.length === 0) return undefined;

  const doi = work.doi ? normalizeDoi(work.doi) : undefined;
  const openAlexId = work.id.replace("https://openalex.org/", "");
  const canonicalUrl = doi
    ? `https://doi.org/${doi}`
    : (work.primary_location?.landing_page_url ?? work.id);
  const oaUrl =
    work.best_oa_location?.pdf_url ??
    work.best_oa_location?.landing_page_url ??
    work.open_access?.oa_url ??
    undefined;

  const year = work.publication_year ?? (work.publication_date ? new Date(work.publication_date).getUTCFullYear() : undefined);
  if (!year) return undefined;

  const candidate = {
    id: doi ?? openAlexId,
    title,
    authors,
    year,
    publicationDate: work.publication_date ?? undefined,
    venue: work.primary_location?.source?.display_name ?? undefined,
    type: mapType(work.type),
    doi,
    openAlexId,
    url: canonicalUrl,
    oaUrl,
    source: "openalex" as const,
  };

  const parsed = Publication.safeParse(candidate);
  if (!parsed.success) {
    console.warn(`[sync-publications] Skipping malformed work "${title}":`, parsed.error.issues);
    return undefined;
  }
  return parsed.data;
}

export function pickBest(group: Publication[]): Publication {
  return [...group].sort((a, b) => {
    if (Boolean(a.doi) !== Boolean(b.doi)) return a.doi ? -1 : 1;
    const preprintRank = (p: Publication) => (p.type === "preprint" ? 1 : 0);
    if (preprintRank(a) !== preprintRank(b)) return preprintRank(a) - preprintRank(b);
    if (Boolean(a.venue) !== Boolean(b.venue)) return a.venue ? -1 : 1;
    return (b.publicationDate ?? `${b.year}-01-01`).localeCompare(a.publicationDate ?? `${a.year}-01-01`);
  })[0];
}

/** Dedup pass 1 by DOI, pass 2 by normalized title (spec: DOI primary, title secondary). */
export function dedupePublications(pubs: Publication[]): Publication[] {
  const byDoi = new Map<string, Publication[]>();
  const withoutDoi: Publication[] = [];
  for (const p of pubs) {
    if (p.doi) {
      const key = normalizeDoi(p.doi);
      const group = byDoi.get(key) ?? [];
      group.push(p);
      byDoi.set(key, group);
    } else {
      withoutDoi.push(p);
    }
  }
  const afterDoiPass = [...Array.from(byDoi.values()).map(pickBest), ...withoutDoi];

  const byTitle = new Map<string, Publication[]>();
  for (const p of afterDoiPass) {
    const key = normalizeTitle(p.title);
    const group = byTitle.get(key) ?? [];
    group.push(p);
    byTitle.set(key, group);
  }
  const afterExactTitlePass = Array.from(byTitle.values()).map(pickBest);

  return dedupeFuzzyByTitle(afterExactTitlePass);
}

function titleTokens(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Catches near-duplicates that survive exact-title matching because a
 * preprint's title genuinely differs from its published version by a
 * word or two — e.g. "...Framework for LLMs Using..." (published) vs
 * "...Framework in LLMs Using..." (preprint of the same paper). Exact
 * normalized-title matching treats these as different strings; a high
 * token-set (Jaccard) similarity, restricted to publications at most a
 * year apart so unrelated-but-similarly-worded papers aren't merged,
 * catches them without needing a fuzzy-matching dependency.
 */
export function dedupeFuzzyByTitle(pubs: Publication[], threshold = 0.82): Publication[] {
  const tokenSets = pubs.map((p) => titleTokens(p.title));
  const used = new Array(pubs.length).fill(false);
  const result: Publication[] = [];

  for (let i = 0; i < pubs.length; i++) {
    if (used[i]) continue;
    const group = [pubs[i]];
    used[i] = true;
    for (let j = i + 1; j < pubs.length; j++) {
      if (used[j]) continue;
      if (Math.abs(pubs[i].year - pubs[j].year) > 1) continue;
      if (jaccard(tokenSets[i], tokenSets[j]) >= threshold) {
        group.push(pubs[j]);
        used[j] = true;
      }
    }
    result.push(group.length > 1 ? pickBest(group) : pubs[i]);
  }
  return result;
}

/** Fills in a missing venue from DBLP when a normalized-title match exists. Best-effort only. */
export function crossCheckWithDblp(pubs: Publication[], dblpRecords: DblpRecord[]): Publication[] {
  const dblpByTitle = new Map<string, DblpRecord>();
  for (const r of dblpRecords) dblpByTitle.set(r.normalizedTitle, r);

  return pubs.map((p) => {
    if (p.venue) return p;
    const match = dblpByTitle.get(normalizeTitle(p.title));
    if (match?.venue) {
      return { ...p, venue: match.venue };
    }
    return p;
  });
}

export function sortNewestFirst(pubs: Publication[]): Publication[] {
  return [...pubs].sort((a, b) => {
    const dateA = a.publicationDate ?? `${a.year}-01-01`;
    const dateB = b.publicationDate ?? `${b.year}-01-01`;
    return dateB.localeCompare(dateA);
  });
}

async function main() {
  const previous = readJsonIfExists<PublicationsFileT>(OUTPUT_PATH);

  let openAlexStatus: "ok" | "error" = "error";
  let works: OpenAlexWork[] = [];
  try {
    const author = await fetchAuthorByOrcid(ORCID);
    if (!author) throw new Error(`No OpenAlex author found for ORCID ${ORCID}`);
    console.log(`[sync-publications] Resolved OpenAlex author: ${author.display_name} (${author.id})`);
    works = await fetchAllWorksForAuthor(author.id);
    openAlexStatus = "ok";
    console.log(`[sync-publications] Fetched ${works.length} works from OpenAlex.`);
  } catch (err) {
    console.error("[sync-publications] OpenAlex fetch failed:", err);
  }

  if (openAlexStatus === "error" || works.length === 0) {
    if (previous) {
      console.warn(
        "[sync-publications] OpenAlex unavailable/empty — keeping previously generated publications.json unchanged.",
      );
      const preserved: PublicationsFileT = {
        ...previous,
        sourceStatus: { ...previous.sourceStatus, openalex: "stale" },
      };
      writeJsonDeterministic(OUTPUT_PATH, preserved);
      return;
    }
    console.error(
      "[sync-publications] OpenAlex unavailable and no previous publications.json exists. Writing an empty placeholder.",
    );
    writeJsonDeterministic(OUTPUT_PATH, {
      generatedAt: new Date().toISOString(),
      sourceStatus: { openalex: "error", dblp: "skipped" },
      count: 0,
      items: [],
    } satisfies PublicationsFileT);
    process.exitCode = 1;
    return;
  }

  const unrelated = works.filter(isUnrelatedField);
  if (unrelated.length > 0) {
    console.warn(
      `[sync-publications] Excluding ${unrelated.length} work(s) that match an unrelated-field OpenAlex author-disambiguation contamination (see UNRELATED_TOPIC_KEYWORDS comment):`,
    );
    for (const w of unrelated) console.warn(`  - [${w.publication_year}] ${w.title ?? w.display_name}`);
  }
  const relevantWorks = works.filter((w) => !isUnrelatedField(w));

  let publications = relevantWorks.map(workToPublication).filter((p): p is Publication => Boolean(p));
  publications = dedupePublications(publications);

  let dblpStatus: "ok" | "error" | "skipped" = "skipped";
  try {
    const dblpRecords = await fetchDblpRecords(DBLP_PID);
    if (dblpRecords.length > 0) {
      publications = crossCheckWithDblp(publications, dblpRecords);
      dblpStatus = "ok";
      console.log(`[sync-publications] Cross-checked against ${dblpRecords.length} DBLP records.`);
    } else {
      dblpStatus = "error";
      console.warn("[sync-publications] DBLP returned no records — continuing with OpenAlex data only.");
    }
  } catch (err) {
    dblpStatus = "error";
    console.warn("[sync-publications] DBLP cross-check failed (continuing with OpenAlex-only data):", (err as Error).message);
  }

  publications = sortNewestFirst(publications);

  const file: PublicationsFileT = {
    generatedAt: new Date().toISOString(),
    sourceStatus: { openalex: openAlexStatus, dblp: dblpStatus },
    count: publications.length,
    items: publications,
  };

  const parsed = PublicationsFile.safeParse(file);
  if (!parsed.success) {
    console.error("[sync-publications] Generated data failed schema validation:", parsed.error.issues);
    process.exitCode = 1;
    return;
  }

  const changed = writeJsonDeterministic(OUTPUT_PATH, parsed.data);
  console.log(
    changed
      ? `[sync-publications] Wrote ${publications.length} publications to ${OUTPUT_PATH}.`
      : `[sync-publications] No changes — ${publications.length} publications already up to date.`,
  );
}

// Guarded so this module can be imported for its pure functions (tests) without
// triggering a live sync run — only executes when run directly via `tsx`/`node`.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("[sync-publications] Unexpected failure:", err);
    process.exitCode = 1;
  });
}
