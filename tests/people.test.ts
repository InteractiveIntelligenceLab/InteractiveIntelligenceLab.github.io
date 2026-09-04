import { describe, it, expect } from "vitest";
import { normalizeCategory, normalizeStatus, normalizeRow, toStringList, toOptionalYear } from "../scripts/sync-people";
import { groupCurrentByCategory, getAlumni, getVisiblePeople } from "../src/lib/people";
import type { Person, PersonCategoryDef } from "../src/lib/schemas";

describe("normalizeCategory", () => {
  it("maps common aliases to canonical category ids", () => {
    expect(normalizeCategory("PhD Scholar")).toBe("phd");
    expect(normalizeCategory("ms")).toBe("ms");
    expect(normalizeCategory("Project Associate")).toBe("project-staff");
    expect(normalizeCategory("Interns")).toBe("interns");
    expect(normalizeCategory("Faculty")).toBe("faculty");
  });

  it("returns undefined for unrecognized categories", () => {
    expect(normalizeCategory("Postdoc")).toBeUndefined();
    expect(normalizeCategory("")).toBeUndefined();
  });
});

describe("normalizeStatus", () => {
  it("accepts the three known statuses case-insensitively", () => {
    expect(normalizeStatus("current").status).toBe("current");
    expect(normalizeStatus("Alumni").status).toBe("alumni");
    expect(normalizeStatus("HIDDEN").status).toBe("hidden");
  });

  it("defaults blank/unrecognized status to hidden, with a warning", () => {
    expect(normalizeStatus("").status).toBe("hidden");
    expect(normalizeStatus("").warning).toBeDefined();
    expect(normalizeStatus("retired").status).toBe("hidden");
    expect(normalizeStatus("retired").warning).toContain("retired");
  });
});

describe("toStringList / toOptionalYear", () => {
  it("splits comma-separated research interests and trims whitespace", () => {
    expect(toStringList("RL,  NLP ,Vision")).toEqual(["RL", "NLP", "Vision"]);
    expect(toStringList("")).toEqual([]);
  });

  it("parses a valid year and rejects blank/non-numeric input", () => {
    expect(toOptionalYear("2023")).toBe(2023);
    expect(toOptionalYear("")).toBeUndefined();
    expect(toOptionalYear("not-a-year")).toBeUndefined();
  });
});

describe("normalizeRow", () => {
  const baseRow = {
    "Full Name": "Jane Doe",
    "Role / Title": "PhD Scholar",
    Category: "PhD",
    Status: "current",
    "Display Order": "1",
  };

  it("builds a valid Person from a well-formed row", () => {
    const result = normalizeRow(baseRow, 0);
    expect(result.ok).toBe(true);
    expect(result.person?.slug).toBe("jane-doe");
    expect(result.person?.category).toBe("phd");
  });

  it("reports an error and skips rows missing required fields", () => {
    const result = normalizeRow({ ...baseRow, "Full Name": "" }, 0);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(" ")).toContain("Full Name");
  });

  it("reports an error for an unrecognized category rather than guessing", () => {
    const result = normalizeRow({ ...baseRow, Category: "Wizard" }, 0);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(" ")).toContain("Category");
  });

  it("rejects a non-https professional website URL at the schema layer", () => {
    const result = normalizeRow({ ...baseRow, "Professional Website": "javascript:alert(1)" }, 0);
    expect(result.ok).toBe(false);
  });
});

const categories: PersonCategoryDef[] = [
  { id: "faculty", label: "Faculty", order: 1 },
  { id: "phd", label: "PhD Scholars", order: 2 },
];

function person(overrides: Partial<Person>): Person {
  return {
    slug: "person",
    name: "Person",
    role: "Role",
    category: "phd",
    status: "current",
    researchInterests: [],
    order: 0,
    ...overrides,
  };
}

describe("groupCurrentByCategory", () => {
  it("groups only current people, excluding alumni and hidden", () => {
    const people = [
      person({ slug: "a", status: "current", category: "phd" }),
      person({ slug: "b", status: "alumni", category: "phd" }),
      person({ slug: "c", status: "hidden", category: "phd" }),
      person({ slug: "d", status: "current", category: "faculty" }),
    ];
    const groups = groupCurrentByCategory(people, categories);
    expect(groups.map((g) => g.category.id)).toEqual(["faculty", "phd"]);
    expect(groups.find((g) => g.category.id === "phd")?.people.map((p) => p.slug)).toEqual(["a"]);
  });

  it("omits empty categories", () => {
    const people = [person({ slug: "a", status: "current", category: "faculty" })];
    const groups = groupCurrentByCategory(people, categories);
    expect(groups).toHaveLength(1);
    expect(groups[0].category.id).toBe("faculty");
  });
});

describe("getAlumni", () => {
  it("returns only alumni, sorted by most recent alumniYear first", () => {
    const people = [
      person({ slug: "old", status: "alumni", alumniYear: 2018 }),
      person({ slug: "current", status: "current" }),
      person({ slug: "recent", status: "alumni", alumniYear: 2023 }),
    ];
    const alumni = getAlumni(people);
    expect(alumni.map((p) => p.slug)).toEqual(["recent", "old"]);
  });
});

describe("getVisiblePeople", () => {
  it("excludes hidden people but keeps current and alumni", () => {
    const people = [
      person({ slug: "a", status: "current" }),
      person({ slug: "b", status: "hidden" }),
      person({ slug: "c", status: "alumni" }),
    ];
    expect(getVisiblePeople(people).map((p) => p.slug)).toEqual(["a", "c"]);
  });
});
