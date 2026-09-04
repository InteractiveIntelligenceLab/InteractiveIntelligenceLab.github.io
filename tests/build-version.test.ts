import { describe, it, expect } from "vitest";
import { buildVersionPayload } from "../scripts/generate-build-version";

describe("buildVersionPayload", () => {
  it("includes the given commit and an ISO builtAt timestamp", () => {
    const now = new Date("2026-01-15T10:00:00.000Z");
    const result = buildVersionPayload("abc123", now);
    expect(result).toEqual({ commit: "abc123", builtAt: "2026-01-15T10:00:00.000Z" });
  });

  it("falls back commit value is passed through as-is (e.g. 'local')", () => {
    const result = buildVersionPayload("local", new Date());
    expect(result.commit).toBe("local");
  });
});
