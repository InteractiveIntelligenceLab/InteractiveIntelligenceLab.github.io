// Thin client for DBLP's per-author XML export, used only as a secondary
// cross-check/fallback source for publications (never primary — see
// scripts/sync-publications.ts). DBLP has no API key and is sometimes
// temporarily unavailable (observed a 503 during development); callers must
// treat a failure here as non-fatal.
import { XMLParser } from "fast-xml-parser";
import { fetchWithRetry } from "./http.js";
import { normalizeTitle } from "./text.js";

export interface DblpRecord {
  title: string;
  normalizedTitle: string;
  year: number | undefined;
  venue: string | undefined;
  type: string;
}

const DBLP_PID = "69/2281"; // Balaraman Ravindran — https://dblp.org/pid/69/2281.html

export async function fetchDblpRecords(pid: string = DBLP_PID): Promise<DblpRecord[]> {
  const res = await fetchWithRetry(`https://dblp.org/pid/${pid}.xml`, {
    retries: 2,
    timeoutMs: 15_000,
  });
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);
  const person = doc.dblpperson;
  if (!person) return [];

  // DBLP's per-author XML repeats a wrapper `<r>` element, each containing
  // exactly one typed child, e.g. <r><article .../></r>, <r><inproceedings .../></r>.
  const pubTypes = ["article", "inproceedings", "incollection", "proceedings", "book"];
  const rEntries: unknown[] = Array.isArray(person.r) ? person.r : person.r ? [person.r] : [];

  const records: DblpRecord[] = [];
  for (const rEntry of rEntries) {
    if (typeof rEntry !== "object" || rEntry === null) continue;
    for (const type of pubTypes) {
      const entry = (rEntry as Record<string, unknown>)[type] as
        | Record<string, unknown>
        | undefined;
      if (!entry) continue;
      const rawTitle =
        typeof entry.title === "object" && entry.title !== null
          ? (entry.title as Record<string, unknown>)["#text"]
          : entry.title;
      if (!rawTitle) continue;
      const title = String(rawTitle).replace(/\.$/, "");
      records.push({
        title,
        normalizedTitle: normalizeTitle(title),
        year: entry.year ? Number(entry.year) : undefined,
        venue: (entry.journal as string) ?? (entry.booktitle as string) ?? undefined,
        type,
      });
    }
  }
  return records;
}
