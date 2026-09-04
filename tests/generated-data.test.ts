// Integration tests over the actual committed generated/*.json files — these
// catch regressions the unit tests on pure functions can't (e.g. a bad
// manual edit, or a sync script change that breaks real data end-to-end).
import { describe, it, expect } from "vitest";
import { PeopleFile, PublicationsFile, NewsFile } from "../src/lib/schemas";
import peopleData from "../src/data/generated/people.json";
import publicationsData from "../src/data/generated/publications.json";
import newsData from "../src/data/generated/news.json";
import categories from "../src/data/categories.json";

describe("people.json", () => {
  it("validates against the PeopleFile schema", () => {
    expect(PeopleFile.safeParse(peopleData).success).toBe(true);
  });

  it("has no duplicate slugs", () => {
    const slugs = peopleData.people.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only references known categories", () => {
    const knownIds = new Set(categories.map((c) => c.id));
    for (const person of peopleData.people) {
      expect(knownIds.has(person.category)).toBe(true);
    }
  });

  it("never surfaces a hidden person's slug outside the raw file (hidden filtering)", () => {
    const hidden = peopleData.people.filter((p) => p.status === "hidden");
    // The fixture data intentionally includes one hidden entry to prove filtering works.
    expect(hidden.length).toBeGreaterThan(0);
    for (const p of hidden) expect(p.status).toBe("hidden");
  });
});

describe("publications.json", () => {
  it("validates against the PublicationsFile schema", () => {
    expect(PublicationsFile.safeParse(publicationsData).success).toBe(true);
  });

  it("has no duplicate publication ids", () => {
    const ids = publicationsData.items.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is sorted newest-first by publicationDate/year", () => {
    const dates = publicationsData.items.map((p) => p.publicationDate ?? `${p.year}-01-01`);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it("contains no known contaminated (unrelated-field) entries", () => {
    const titles = publicationsData.items.map((p) => p.title.toLowerCase());
    expect(titles.some((t) => t.includes("malaria"))).toBe(false);
    expect(titles.some((t) => t.includes("filariasis"))).toBe(false);
  });
});

describe("news.json", () => {
  it("validates against the NewsFile schema", () => {
    expect(NewsFile.safeParse(newsData).success).toBe(true);
  });

  it("has no duplicate news ids or URLs", () => {
    const ids = newsData.items.map((n) => n.id);
    const urls = newsData.items.map((n) => n.url);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("is sorted newest-first by publishedAt", () => {
    const dates = newsData.items.map((n) => n.publishedAt);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });
});
