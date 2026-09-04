// Deterministic JSON read/write helpers so generated files produce a stable
// diff (only when the underlying data actually changed) and so a source
// outage never wipes out a previously-good generated file.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export function readJsonIfExists<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch (err) {
    console.error(`[fs-json] Failed to parse existing JSON at ${path}:`, err);
    return undefined;
  }
}

/** Recursively sorts object keys so semantically-identical data serializes identically. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Writes JSON deterministically (stable key order, 2-space indent, trailing
 * newline). Returns true if the file content actually changed on disk.
 */
export function writeJsonDeterministic(path: string, data: unknown): boolean {
  mkdirSync(dirname(path), { recursive: true });
  const next = JSON.stringify(sortKeysDeep(data), null, 2) + "\n";
  const prev = existsSync(path) ? readFileSync(path, "utf-8") : undefined;
  if (prev === next) return false;
  writeFileSync(path, next, "utf-8");
  return true;
}
