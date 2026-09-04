import { describe, it, expect } from "vitest";
import { Person, Publication, NewsItem, httpUrl, httpsUrl, isoDate, slug } from "../src/lib/schemas";

describe("httpUrl / httpsUrl", () => {
  it("accepts http and https URLs", () => {
    expect(httpUrl.safeParse("https://example.com").success).toBe(true);
    expect(httpUrl.safeParse("http://example.com").success).toBe(true);
  });

  it("rejects javascript:, data:, and malformed URLs", () => {
    expect(httpUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrl.safeParse("data:text/html,<script>alert(1)</script>").success).toBe(false);
    expect(httpUrl.safeParse("not a url").success).toBe(false);
  });

  it("httpsUrl rejects plain http", () => {
    expect(httpsUrl.safeParse("http://example.com").success).toBe(false);
    expect(httpsUrl.safeParse("https://example.com").success).toBe(true);
  });
});

describe("isoDate", () => {
  it("accepts parseable dates", () => {
    expect(isoDate.safeParse("2026-01-15").success).toBe(true);
    expect(isoDate.safeParse("2026-01-15T10:00:00.000Z").success).toBe(true);
  });

  it("rejects malformed dates", () => {
    expect(isoDate.safeParse("not-a-date").success).toBe(false);
    expect(isoDate.safeParse("").success).toBe(false);
    expect(isoDate.safeParse("2026-13-45").success).toBe(false);
  });
});

describe("slug", () => {
  it("accepts lowercase kebab-case", () => {
    expect(slug.safeParse("jane-doe").success).toBe(true);
    expect(slug.safeParse("balaraman-ravindran").success).toBe(true);
  });

  it("rejects uppercase, spaces, and underscores", () => {
    expect(slug.safeParse("Jane Doe").success).toBe(false);
    expect(slug.safeParse("jane_doe").success).toBe(false);
    expect(slug.safeParse("").success).toBe(false);
  });
});

const validPerson = {
  slug: "jane-doe",
  name: "Jane Doe",
  role: "PhD Scholar",
  category: "phd",
  status: "current" as const,
  researchInterests: ["reinforcement learning"],
  order: 1,
};

describe("Person schema", () => {
  it("accepts a minimal valid person", () => {
    expect(Person.safeParse(validPerson).success).toBe(true);
  });

  it("rejects a non-https professionalUrl", () => {
    const result = Person.safeParse({ ...validPerson, professionalUrl: "http://example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects a javascript: professionalUrl", () => {
    const result = Person.safeParse({ ...validPerson, professionalUrl: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid status", () => {
    const result = Person.safeParse({ ...validPerson, status: "retired" });
    expect(result.success).toBe(false);
  });

  it("defaults researchInterests to an empty array when omitted", () => {
    const { researchInterests, ...rest } = validPerson;
    const result = Person.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.researchInterests).toEqual([]);
  });
});

describe("Publication schema", () => {
  const validPub = {
    id: "10.1234/abc",
    title: "A Paper",
    authors: ["Jane Doe"],
    year: 2024,
    type: "article" as const,
    url: "https://doi.org/10.1234/abc",
    source: "openalex" as const,
  };

  it("accepts a minimal valid publication", () => {
    expect(Publication.safeParse(validPub).success).toBe(true);
  });

  it("rejects a publication with no authors", () => {
    expect(Publication.safeParse({ ...validPub, authors: [] }).success).toBe(false);
  });

  it("rejects an out-of-range year", () => {
    expect(Publication.safeParse({ ...validPub, year: 1500 }).success).toBe(false);
  });

  it("rejects an unrecognized publication type", () => {
    expect(Publication.safeParse({ ...validPub, type: "tweet" }).success).toBe(false);
  });
});

describe("NewsItem schema", () => {
  const validNews = {
    id: "abc123",
    title: "Prof. Ravindran wins award",
    source: "The Hindu",
    publishedAt: "2026-01-01T00:00:00.000Z",
    url: "https://example.com/article",
    matchedBy: "exact-full-name",
    verified: true,
  };

  it("accepts a valid news item", () => {
    expect(NewsItem.safeParse(validNews).success).toBe(true);
  });

  it("rejects a malformed publishedAt date", () => {
    expect(NewsItem.safeParse({ ...validNews, publishedAt: "yesterday" }).success).toBe(false);
  });

  it("rejects a non-http url", () => {
    expect(NewsItem.safeParse({ ...validNews, url: "ftp://example.com/x" }).success).toBe(false);
  });
});
