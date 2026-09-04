import { describe, it, expect } from "vitest";
import {
  dedupePublications,
  sortNewestFirst,
  mapType,
  normalizeDoi,
  isUnrelatedField,
} from "../scripts/sync-publications";
import type { Publication } from "../src/lib/schemas";
import type { OpenAlexWork } from "../scripts/lib/openalex";

function pub(overrides: Partial<Publication>): Publication {
  return {
    id: "id-1",
    title: "A Paper",
    authors: ["Jane Doe"],
    year: 2024,
    type: "article",
    url: "https://example.com/paper",
    source: "openalex",
    ...overrides,
  };
}

describe("normalizeDoi", () => {
  it("strips the doi.org host and lowercases", () => {
    expect(normalizeDoi("https://doi.org/10.1234/ABC")).toBe("10.1234/abc");
    expect(normalizeDoi("https://dx.doi.org/10.1234/ABC")).toBe("10.1234/abc");
    expect(normalizeDoi("10.1234/abc")).toBe("10.1234/abc");
  });
});

describe("mapType", () => {
  it("passes through known OpenAlex types", () => {
    expect(mapType("article")).toBe("article");
    expect(mapType("preprint")).toBe("preprint");
  });

  it("falls back to 'other' for unrecognized/null types", () => {
    expect(mapType("erratum")).toBe("other");
    expect(mapType(null)).toBe("other");
  });
});

describe("dedupePublications", () => {
  it("keeps a single entry when the same DOI appears twice", () => {
    const items = [
      pub({ id: "a", doi: "10.1/x", title: "Same Paper" }),
      pub({ id: "b", doi: "10.1/x", title: "Same Paper" }),
    ];
    expect(dedupePublications(items)).toHaveLength(1);
  });

  it("merges a DOI-less duplicate with a DOI-bearing one via normalized title (preprint + assigned-DOI case)", () => {
    const items = [
      pub({ id: "a", doi: undefined, title: "How Much Online RL Is Enough?", type: "preprint" }),
      pub({ id: "b", doi: "10.1/x", title: "How Much Online RL Is Enough?", type: "preprint" }),
    ];
    const result = dedupePublications(items);
    expect(result).toHaveLength(1);
    expect(result[0].doi).toBe("10.1/x");
  });

  it("keeps distinct publications with different titles and DOIs", () => {
    const items = [pub({ id: "a", doi: "10.1/x", title: "Paper One" }), pub({ id: "b", doi: "10.1/y", title: "Paper Two" })];
    expect(dedupePublications(items)).toHaveLength(2);
  });

  it("prefers the entry with a venue when merging duplicates", () => {
    const items = [
      pub({ id: "a", doi: "10.1/x", title: "T", venue: undefined }),
      pub({ id: "b", doi: "10.1/x", title: "T", venue: "NeurIPS" }),
    ];
    const result = dedupePublications(items);
    expect(result[0].venue).toBe("NeurIPS");
  });
});

describe("sortNewestFirst", () => {
  it("sorts by publicationDate, newest first", () => {
    const items = [
      pub({ id: "a", year: 2020, publicationDate: "2020-01-01" }),
      pub({ id: "b", year: 2024, publicationDate: "2024-06-01" }),
      pub({ id: "c", year: 2022, publicationDate: "2022-03-01" }),
    ];
    expect(sortNewestFirst(items).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("falls back to Jan 1 of `year` when publicationDate is missing", () => {
    const items = [pub({ id: "a", year: 2020, publicationDate: undefined }), pub({ id: "b", year: 2021, publicationDate: undefined })];
    expect(sortNewestFirst(items).map((p) => p.id)).toEqual(["b", "a"]);
  });
});

function work(overrides: Partial<OpenAlexWork>): OpenAlexWork {
  return {
    id: "https://openalex.org/W1",
    title: "Some CS Paper",
    display_name: "Some CS Paper",
    publication_date: "2024-01-01",
    publication_year: 2024,
    type: "article",
    doi: null,
    authorships: [{ author: { id: "A1", display_name: "Balaraman Ravindran" } }],
    primary_location: null,
    open_access: null,
    best_oa_location: null,
    primary_topic: { display_name: "Machine Learning" },
    concepts: [{ display_name: "Reinforcement learning" }],
    ...overrides,
  };
}

describe("isUnrelatedField (OpenAlex author-disambiguation contamination filter)", () => {
  it("does not flag a normal CS/ML work", () => {
    expect(isUnrelatedField(work({}))).toBe(false);
  });

  it("flags works whose topic/concepts indicate an unrelated biomedical field", () => {
    expect(
      isUnrelatedField(
        work({
          primary_topic: { display_name: "Malaria Research and Control" },
          concepts: [{ display_name: "Malaria" }, { display_name: "Vaccine" }],
        }),
      ),
    ).toBe(true);
  });
});
