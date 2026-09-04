import { describe, it, expect } from "vitest";
import { SiteConfig, Announcement } from "../src/lib/schemas";
import siteConfig from "../src/data/site-config.json";

describe("site-config.json (committed file)", () => {
  it("is valid against the SiteConfig schema", () => {
    const result = SiteConfig.safeParse(siteConfig);
    expect(result.success).toBe(true);
  });

  it("ships with the announcement disabled by default", () => {
    expect(siteConfig.announcement.enabled).toBe(false);
  });

  it("uses the official lab email", () => {
    expect(siteConfig.email).toBe("iil@dsai.iitm.ac.in");
  });
});

describe("Announcement schema business rules", () => {
  const base = {
    enabled: true,
    id: "test-v1",
    title: "Title",
    message: "Message",
    ctaLabel: "",
    ctaUrl: "",
    dismissible: true,
    startAt: null,
    endAt: null,
  };

  it("allows a disabled announcement with every field blank", () => {
    expect(Announcement.safeParse({ ...base, enabled: false, id: "", title: "", message: "" }).success).toBe(true);
  });

  it("requires title/message/id when enabled", () => {
    expect(Announcement.safeParse({ ...base, title: "" }).success).toBe(false);
    expect(Announcement.safeParse({ ...base, message: "" }).success).toBe(false);
    expect(Announcement.safeParse({ ...base, id: "" }).success).toBe(false);
  });

  it("requires ctaLabel whenever ctaUrl is set", () => {
    expect(Announcement.safeParse({ ...base, ctaUrl: "https://example.com", ctaLabel: "" }).success).toBe(false);
    expect(Announcement.safeParse({ ...base, ctaUrl: "https://example.com", ctaLabel: "Learn more" }).success).toBe(
      true,
    );
  });

  it("rejects a non-https ctaUrl", () => {
    expect(
      Announcement.safeParse({ ...base, ctaUrl: "javascript:alert(1)", ctaLabel: "Click" }).success,
    ).toBe(false);
  });

  it("changing the id is how a re-shown announcement is achieved (documented behavior, not schema-enforced)", () => {
    // The client stores dismissal in localStorage keyed by announcement.id — this
    // test just pins that the schema treats id as a plain required string.
    expect(Announcement.safeParse({ ...base, id: "example-announcement-v2" }).success).toBe(true);
  });
});
