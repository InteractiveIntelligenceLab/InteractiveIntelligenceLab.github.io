#!/usr/bin/env tsx
// Generates src/data/generated/people.json (and public/images/people/*.webp)
// from the People Google Sheet that the admin-only Google Form writes to.
// See README.md "Google setup" and "People management" for the full workflow.
//
// Without GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEET_ID configured, this
// script falls back to the deterministic sample dataset in
// scripts/fixtures/people.sample.json so `npm run build` and the test suite
// work out of the box for local development (spec: never make the site
// depend on Google being reachable, and always leave a working local build).
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { loadEnv } from "./lib/env.js";
import { readJsonIfExists, writeJsonDeterministic } from "./lib/fs-json.js";
import {
  hasGoogleCredentials,
  readSheetRows,
  extractDriveFileId,
  downloadDriveFile,
  isFileInExpectedFolder,
} from "./lib/google.js";
import { processProfileImage, UnsafeImageError } from "./lib/image.js";
import { slugify } from "./lib/text.js";
import { Person, PeopleFile, type PeopleFile as PeopleFileT } from "../src/lib/schemas.js";
import categories from "../src/data/categories.json" with { type: "json" };

loadEnv();

const OUTPUT_PATH = "src/data/generated/people.json";
const IMAGES_DIR = "public/images/people";
const FIXTURE_PATH = "scripts/fixtures/people.sample.json";

const CATEGORY_ALIASES: Record<string, string> = {
  faculty: "faculty",
  phd: "phd",
  "phd scholar": "phd",
  "phd scholars": "phd",
  "phd student": "phd",
  "ph.d": "phd",
  "ph.d.": "phd",
  ms: "ms",
  "ms scholar": "ms",
  "ms scholars": "ms",
  "m.s.": "ms",
  masters: "ms",
  "ms student": "ms",
  "project staff": "project-staff",
  "project staff / researchers": "project-staff",
  "project associate": "project-staff",
  "project associates": "project-staff",
  "project assistant": "project-staff",
  researcher: "project-staff",
  researchers: "project-staff",
  intern: "interns",
  interns: "interns",
  "research intern": "interns",
};

const KNOWN_CATEGORY_IDS = new Set((categories as { id: string }[]).map((c) => c.id));

export function normalizeCategory(raw: string): string | undefined {
  const mapped = CATEGORY_ALIASES[raw.trim().toLowerCase()];
  if (mapped && KNOWN_CATEGORY_IDS.has(mapped)) return mapped;
  if (KNOWN_CATEGORY_IDS.has(raw.trim().toLowerCase())) return raw.trim().toLowerCase();
  return undefined;
}

export function normalizeStatus(raw: string): { status: "current" | "alumni" | "hidden"; warning?: string } {
  const key = raw.trim().toLowerCase();
  if (key === "current") return { status: "current" };
  if (key === "alumni") return { status: "alumni" };
  if (key === "hidden") return { status: "hidden" };
  if (key === "") return { status: "hidden", warning: "Status blank — defaulting to hidden until reviewed" };
  return { status: "hidden", warning: `Unrecognized status "${raw}" — defaulting to hidden` };
}

export function toOptionalYear(raw: string): number | undefined {
  const n = Number(raw.trim());
  return raw.trim() && Number.isInteger(n) ? n : undefined;
}

export function toStringList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface RowResult {
  ok: boolean;
  slug: string;
  person?: Person;
  errors?: string[];
  warnings?: string[];
}

export function normalizeRow(row: Record<string, string>, index: number): RowResult {
  const name = (row["Full Name"] ?? "").trim();
  const explicitSlug = (row["Slug"] ?? "").trim();
  const slug = slugify(explicitSlug || name || `row-${index}`);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!name) errors.push("Missing Full Name");

  const role = (row["Role / Title"] ?? "").trim();
  if (!role) errors.push("Missing Role / Title");

  const rawCategory = (row["Category"] ?? "").trim();
  const category = normalizeCategory(rawCategory);
  if (!category) errors.push(`Unrecognized Category "${rawCategory}"`);

  const { status, warning: statusWarning } = normalizeStatus(row["Status"] ?? "");
  if (statusWarning) warnings.push(statusWarning);

  const professionalUrlRaw = (row["Professional Website"] ?? "").trim();

  if (errors.length > 0) {
    return { ok: false, slug, errors, warnings };
  }

  const candidate = {
    slug,
    name,
    role,
    category: category!,
    status,
    professionalUrl: professionalUrlRaw || undefined,
    researchInterests: toStringList(row["Research Interests"] ?? ""),
    bio: (row["Short Bio"] ?? "").trim() || undefined,
    image: undefined as string | undefined, // filled in after image processing, if any
    order: toOptionalYear(row["Display Order"] ?? "") ?? index,
    joinedYear: toOptionalYear(row["Joined Year"] ?? ""),
    alumniYear: toOptionalYear(row["Alumni Year"] ?? ""),
    currentPosition: (row["Current Position"] ?? "").trim() || undefined,
    currentInstitution: (row["Current Institution"] ?? "").trim() || undefined,
  };

  const parsed = Person.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      slug,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      warnings,
    };
  }

  return { ok: true, slug, person: parsed.data, warnings };
}

async function attachPhoto(row: Record<string, string>, person: Person): Promise<Person> {
  const photoCell = (row["Profile Photo"] ?? "").trim();
  if (!photoCell) return person;

  const fileId = extractDriveFileId(photoCell);
  if (!fileId) {
    console.warn(`[sync-people] ${person.slug}: could not parse a Drive file ID from "${photoCell}" — skipping photo`);
    return person;
  }

  if (!(await isFileInExpectedFolder(fileId))) {
    console.warn(
      `[sync-people] ${person.slug}: Drive file ${fileId} is not in the expected upload folder (GOOGLE_DRIVE_FOLDER_ID) — skipping photo`,
    );
    return person;
  }

  try {
    const raw = await downloadDriveFile(fileId);
    const processed = await processProfileImage(raw);
    mkdirSync(IMAGES_DIR, { recursive: true });
    const outPath = `${IMAGES_DIR}/${person.slug}.webp`;
    writeFileSync(outPath, processed.buffer);
    return { ...person, image: `/images/people/${person.slug}.webp` };
  } catch (err) {
    const reason = err instanceof UnsafeImageError ? err.message : (err as Error).message;
    console.warn(`[sync-people] ${person.slug}: photo rejected/failed (${reason}) — falling back to no photo`);
    return person;
  }
}

async function loadRows(): Promise<{ rows: Record<string, string>[]; source: "google-sheets" | "fixture" }> {
  if (hasGoogleCredentials()) {
    const sheetId = process.env.GOOGLE_SHEET_ID!;
    console.log("[sync-people] Google credentials detected — reading live Sheet data.");
    const rows = await readSheetRows(sheetId);
    return { rows, source: "google-sheets" };
  }
  console.log(
    "[sync-people] GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEET_ID not set — using scripts/fixtures/people.sample.json. " +
      "See README.md 'Google setup' to connect the real pipeline.",
  );
  const rows = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as Record<string, string>[];
  return { rows, source: "fixture" };
}

async function main() {
  const previous = readJsonIfExists<PeopleFileT>(OUTPUT_PATH);

  let rows: Record<string, string>[];
  let source: "google-sheets" | "fixture";
  try {
    ({ rows, source } = await loadRows());
  } catch (err) {
    console.error("[sync-people] Failed to read source data:", err);
    if (previous) {
      console.warn("[sync-people] Keeping previously generated people.json unchanged.");
      writeJsonDeterministic(OUTPUT_PATH, previous);
      return;
    }
    process.exitCode = 1;
    return;
  }

  const canProcessPhotos = source === "google-sheets";
  const people: Person[] = [];
  const rowErrors: { row: number; slug: string; errors: string[] }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = normalizeRow(rows[i], i);
    for (const w of result.warnings ?? []) {
      console.warn(`[sync-people] Row ${i + 1} (${result.slug}): ${w}`);
    }
    if (!result.ok || !result.person) {
      rowErrors.push({ row: i + 1, slug: result.slug, errors: result.errors ?? ["Unknown error"] });
      console.error(`[sync-people] Skipping row ${i + 1} (${result.slug}): ${result.errors?.join("; ")}`);
      continue;
    }
    const withPhoto = canProcessPhotos ? await attachPhoto(rows[i], result.person) : result.person;
    people.push(withPhoto);
  }

  // Duplicate slugs are a data-integrity error, not a partial-row error —
  // fail loudly rather than silently dropping/overwriting one of them.
  const seenSlugs = new Map<string, number>();
  for (const p of people) seenSlugs.set(p.slug, (seenSlugs.get(p.slug) ?? 0) + 1);
  const duplicates = Array.from(seenSlugs.entries()).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    console.error(
      `[sync-people] Duplicate slugs found (must be unique): ${duplicates.map(([s]) => s).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  people.sort((a, b) => a.order - b.order);

  const file: PeopleFileT = {
    generatedAt: new Date().toISOString(),
    source,
    count: people.length,
    people,
  };

  const parsed = PeopleFile.safeParse(file);
  if (!parsed.success) {
    console.error("[sync-people] Generated data failed schema validation:", parsed.error.issues);
    process.exitCode = 1;
    return;
  }

  const changed = writeJsonDeterministic(OUTPUT_PATH, parsed.data);
  console.log(
    changed
      ? `[sync-people] Wrote ${people.length} people (${rowErrors.length} row(s) skipped) to ${OUTPUT_PATH}.`
      : `[sync-people] No changes — ${people.length} people already up to date.`,
  );
  if (rowErrors.length > 0) {
    console.log(`[sync-people] ${rowErrors.length} row(s) had errors and were skipped — see log above.`);
  }
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("[sync-people] Unexpected failure:", err);
    process.exitCode = 1;
  });
}
