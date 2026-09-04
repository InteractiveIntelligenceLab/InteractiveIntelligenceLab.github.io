// Single source of truth for the shape of every generated/config JSON file.
// Imported both by build-time sync/validation scripts (scripts/*.ts, run under
// tsx/Node) and by Astro pages/components (run under Vite) — do not import
// anything Node-only (fs, path, etc.) from this file.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Only allow http(s) URLs — never javascript:, data:, or other schemes. */
export const httpUrl = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "must be an http(s) URL" },
  );

/** Stricter variant used for user/admin-supplied "professional" links. */
export const httpsUrl = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "must be an https:// URL" },
  );

export const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be a parseable date string",
  });

export const slug = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase kebab-case slug");

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const PersonStatus = z.enum(["current", "alumni", "hidden"]);
export type PersonStatus = z.infer<typeof PersonStatus>;

export const PersonCategoryDef = z.object({
  id: slug,
  label: z.string().min(1),
  order: z.number().int(),
});
export type PersonCategoryDef = z.infer<typeof PersonCategoryDef>;

export const Person = z.object({
  slug,
  name: z.string().min(1),
  role: z.string().min(1),
  category: slug,
  status: PersonStatus,
  professionalUrl: httpsUrl.optional(),
  researchInterests: z.array(z.string().min(1)).default([]),
  bio: z.string().optional(),
  image: z.string().optional(),
  order: z.number().int().default(0),
  joinedYear: z.number().int().gte(1990).lte(2100).optional(),
  alumniYear: z.number().int().gte(1990).lte(2100).optional(),
  currentPosition: z.string().optional(),
  currentInstitution: z.string().optional(),
});
export type Person = z.infer<typeof Person>;

export const PeopleFile = z.object({
  generatedAt: isoDate,
  source: z.enum(["google-sheets", "public-google-sheets", "fixture"]),
  count: z.number().int(),
  people: z.array(Person),
});
export type PeopleFile = z.infer<typeof PeopleFile>;

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

export const PublicationType = z.enum([
  "article",
  "conference-paper",
  "preprint",
  "book-chapter",
  "book",
  "dataset",
  "other",
]);

export const Publication = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string().min(1)).min(1),
  year: z.number().int().gte(1900).lte(2100),
  publicationDate: isoDate.optional(),
  venue: z.string().optional(),
  type: PublicationType,
  doi: z.string().optional(),
  openAlexId: z.string().optional(),
  url: httpUrl,
  oaUrl: httpUrl.optional(),
  source: z.enum(["openalex", "dblp", "manual"]),
});
export type Publication = z.infer<typeof Publication>;

export const PublicationsFile = z.object({
  generatedAt: isoDate,
  sourceStatus: z.object({
    openalex: z.enum(["ok", "stale", "error", "skipped"]),
    dblp: z.enum(["ok", "stale", "error", "skipped"]),
  }),
  count: z.number().int(),
  items: z.array(Publication),
});
export type PublicationsFile = z.infer<typeof PublicationsFile>;

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export const NewsItem = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.string().min(1),
  publishedAt: isoDate,
  url: httpUrl,
  matchedBy: z.string().min(1),
  verified: z.boolean(),
  snippet: z.string().optional(),
});
export type NewsItem = z.infer<typeof NewsItem>;

export const NewsFile = z.object({
  generatedAt: isoDate,
  sourceStatus: z.enum(["ok", "stale", "error"]),
  count: z.number().int(),
  items: z.array(NewsItem),
});
export type NewsFile = z.infer<typeof NewsFile>;

export const NewsOverrides = z.object({
  excludedUrls: z.array(z.string()).default([]),
  includedUrls: z.array(z.string()).default([]),
  pinnedIds: z.array(z.string()).default([]),
});
export type NewsOverrides = z.infer<typeof NewsOverrides>;

// ---------------------------------------------------------------------------
// Site config / announcement
// ---------------------------------------------------------------------------

export const Announcement = z
  .object({
    enabled: z.boolean(),
    id: z.string(),
    title: z.string(),
    message: z.string(),
    ctaLabel: z.string(),
    ctaUrl: z.string(),
    dismissible: z.boolean(),
    startAt: z.string().nullable(),
    endAt: z.string().nullable(),
  })
  .superRefine((a, ctx) => {
    if (!a.enabled) return; // disabled announcements may have empty fields
    if (!a.title.trim()) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "title is required when enabled=true" });
    }
    if (!a.message.trim()) {
      ctx.addIssue({ code: "custom", path: ["message"], message: "message is required when enabled=true" });
    }
    if (!a.id.trim()) {
      ctx.addIssue({ code: "custom", path: ["id"], message: "id is required when enabled=true" });
    }
    if (a.ctaUrl && !a.ctaLabel.trim()) {
      ctx.addIssue({ code: "custom", path: ["ctaLabel"], message: "ctaLabel is required when ctaUrl is set" });
    }
    if (a.ctaUrl && !/^https:\/\//i.test(a.ctaUrl)) {
      ctx.addIssue({ code: "custom", path: ["ctaUrl"], message: "ctaUrl must be an https:// URL" });
    }
  });
export type Announcement = z.infer<typeof Announcement>;

export const SiteConfig = z.object({
  siteName: z.string(),
  shortName: z.string(),
  tagline: z.string(),
  email: z.email(),
  address: z.object({
    lines: z.array(z.string()),
  }),
  links: z.object({
    iitm: httpUrl,
    dsai: httpUrl,
    postdoc: httpUrl,
  }),
  announcement: Announcement,
});
export type SiteConfig = z.infer<typeof SiteConfig>;
