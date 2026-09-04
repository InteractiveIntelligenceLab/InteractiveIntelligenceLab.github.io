import type { Person, PersonCategoryDef } from "./schemas";

export interface CategoryGroup {
  category: PersonCategoryDef;
  people: Person[];
}

/** Current (non-hidden, non-alumni) people grouped by category, in category display order. */
export function groupCurrentByCategory(people: Person[], categories: PersonCategoryDef[]): CategoryGroup[] {
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  return sortedCategories
    .map((category) => ({
      category,
      people: people
        .filter((p) => p.status === "current" && p.category === category.id)
        .sort((a, b) => a.order - b.order),
    }))
    .filter((group) => group.people.length > 0);
}

export function getAlumni(people: Person[]): Person[] {
  return people.filter((p) => p.status === "alumni").sort((a, b) => (b.alumniYear ?? 0) - (a.alumniYear ?? 0));
}

export function getVisiblePeople(people: Person[]): Person[] {
  return people.filter((p) => p.status !== "hidden");
}
