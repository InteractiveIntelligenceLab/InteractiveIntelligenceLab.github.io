#!/usr/bin/env tsx
// Standalone content-validation gate, run as part of `npm run build` (and in
// CI before every sync commit) so a bad generated file, a broken cross-
// reference, or an invalid announcement config fails fast with a clear
// message instead of silently shipping. See spec section 40/43.
import { readFileSync } from "node:fs";
import {
  PeopleFile,
  PublicationsFile,
  NewsFile,
  NewsOverrides,
  SiteConfig,
} from "../src/lib/schemas.js";

let hasErrors = false;
function fail(msg: string) {
  console.error(`[validate-content] ERROR: ${msg}`);
  hasErrors = true;
}
function ok(msg: string) {
  console.log(`[validate-content] OK: ${msg}`);
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// --- site-config.json --------------------------------------------------
try {
  SiteConfig.parse(loadJson("src/data/site-config.json"));
  ok("site-config.json is valid (announcement rules enforced by the schema itself)");
} catch (err) {
  fail(`src/data/site-config.json failed validation: ${err}`);
}

// --- categories.json -----------------------------------------------------
let categoryIds = new Set<string>();
try {
  const categories = loadJson("src/data/categories.json") as { id: string }[];
  categoryIds = new Set(categories.map((c) => c.id));
  ok(`categories.json is valid (${categories.length} categories)`);
} catch (err) {
  fail(`src/data/categories.json failed to parse: ${err}`);
}

// --- people.json -----------------------------------------------------------
try {
  const people = PeopleFile.parse(loadJson("src/data/generated/people.json"));
  ok(`people.json is valid (${people.count} people)`);

  const slugs = new Map<string, number>();
  for (const p of people.people) slugs.set(p.slug, (slugs.get(p.slug) ?? 0) + 1);
  for (const [s, count] of slugs) {
    if (count > 1) fail(`Duplicate person slug "${s}" appears ${count} times`);
  }

  for (const p of people.people) {
    if (!categoryIds.has(p.category)) {
      fail(`Person "${p.slug}" has unknown category "${p.category}"`);
    }
    if (p.status === "alumni" && !p.alumniYear) {
      console.warn(`[validate-content] WARN: alumnus "${p.slug}" has no alumniYear`);
    }
  }
} catch (err) {
  fail(`src/data/generated/people.json failed validation: ${err}`);
}

// --- publications.json -----------------------------------------------------
try {
  const publications = PublicationsFile.parse(loadJson("src/data/generated/publications.json"));
  ok(`publications.json is valid (${publications.count} publications)`);

  const ids = new Map<string, number>();
  for (const pub of publications.items) ids.set(pub.id, (ids.get(pub.id) ?? 0) + 1);
  for (const [id, count] of ids) {
    if (count > 1) fail(`Duplicate publication id "${id}" appears ${count} times`);
  }

  for (let i = 1; i < publications.items.length; i++) {
    const prevDate = publications.items[i - 1].publicationDate ?? `${publications.items[i - 1].year}-01-01`;
    const currDate = publications.items[i].publicationDate ?? `${publications.items[i].year}-01-01`;
    if (currDate > prevDate) {
      fail(`publications.json is not sorted newest-first at index ${i}`);
      break;
    }
  }
} catch (err) {
  fail(`src/data/generated/publications.json failed validation: ${err}`);
}

// --- news.json ---------------------------------------------------------
try {
  const news = NewsFile.parse(loadJson("src/data/generated/news.json"));
  ok(`news.json is valid (${news.count} items)`);
  const ids = new Map<string, number>();
  for (const item of news.items) ids.set(item.id, (ids.get(item.id) ?? 0) + 1);
  for (const [id, count] of ids) {
    if (count > 1) fail(`Duplicate news id "${id}" appears ${count} times`);
  }
} catch (err) {
  fail(`src/data/generated/news.json failed validation: ${err}`);
}

// --- news-overrides.json ----------------------------------------------------
try {
  NewsOverrides.parse(loadJson("src/data/news-overrides.json"));
  ok("news-overrides.json is valid");
} catch (err) {
  fail(`src/data/news-overrides.json failed validation: ${err}`);
}

if (hasErrors) {
  console.error("\n[validate-content] Validation failed — see errors above.");
  process.exit(1);
} else {
  console.log("\n[validate-content] All content validated successfully.");
}
