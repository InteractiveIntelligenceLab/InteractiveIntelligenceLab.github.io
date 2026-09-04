# Interactive Intelligence Lab (IIL) — Website

Official website of the Interactive Intelligence Lab, Department of Computer
Science and Engineering, IIT Madras. Built with [Astro](https://astro.build)
+ TypeScript, deployed to GitHub Pages, with people/publications/news kept
current by small scheduled sync scripts instead of manual editing.

This README is written for the next student who inherits this project.
Read it top to bottom once; after that, use it as a reference.

---

## How the site is put together

```
Google Form ──▶ Google Sheet + Drive ──▶ sync-people.ts ─────┐
OpenAlex/DBLP ─────────────────────────▶ sync-publications.ts ├──▶ src/data/generated/*.json ──▶ astro build ──▶ dist/ ──▶ GitHub Pages
Google News RSS ───────────────────────▶ sync-news.ts ────────┘
```

- **The deployed site never calls Google, OpenAlex, DBLP, or Google News at
  runtime.** All three sync scripts run on a schedule (GitHub Actions),
  write plain committed JSON files under `src/data/generated/`, and the
  Astro build reads only those files. If every external service is down
  simultaneously, the site still builds and serves the last known-good data.
- There is no database, no backend server, and no paid CMS. Content lives in
  Git as JSON; "the CMS" is a Google Form + Sheet that only the admin can
  write to.
- Client-side JavaScript is deliberately minimal: a mobile-menu toggle, the
  publications search/filter/sort (vanilla TS, no framework), an announcement
  dialog, and a small "new version available" check. No React, no state
  management library.

### Directory guide

| Path | What's there |
|---|---|
| `src/pages/` | One file per route (`about.astro`, `people.astro`, …). |
| `src/components/` | `Header`, `Footer`, `PersonCard`, `PublicationList`, `NewsCard`, `AnnouncementModal`, `VersionCheck`. |
| `src/layouts/BaseLayout.astro` | HTML shell, SEO meta, includes Header/Footer/AnnouncementModal/VersionCheck. |
| `src/lib/schemas.ts` | The **single source of truth** for the shape of every JSON file (Zod schemas). Both the sync scripts and the Astro pages import from here. |
| `src/lib/` | Small pure helpers (`people.ts` grouping logic, `links.ts` external-link attrs). |
| `src/data/site-config.json` | Lab name, email, address, institutional links, announcement config. Hand-edited. |
| `src/data/categories.json` | People categories (Faculty, PhD, …) with display order. Add a category here — no component code changes needed. |
| `src/data/news-overrides.json` | Manual excludes/includes/pins for the news pipeline. Hand-edited. |
| `src/data/generated/` | **Generated, but committed.** `people.json`, `publications.json`, `news.json`. Don't hand-edit; re-run the relevant sync script instead. |
| `scripts/sync-*.ts` | The three sync pipelines. Runnable locally or in CI. |
| `scripts/validate-content.ts` | Schema-validates every JSON file; part of `npm run build`. |
| `scripts/check-links.ts` | External link checker; run manually or via `.github/workflows/link-check.yml`. |
| `scripts/generate-build-version.ts` | Writes `public/build-version.json` (git SHA + timestamp) before every build. |
| `.github/workflows/` | `deploy.yml` (build + Pages deploy), `sync-people.yml`, `sync-publications.yml`, `sync-news.yml`, `link-check.yml`. |
| `docs/legacy-content-map.md` | Where every piece of migrated prose came from, and what was deliberately left out. Read this before rewording any "About"/"Join Us" copy. |

---

## Local development

Requires Node.js **22.12+** (the version pinned in `.nvmrc`) and npm.

```bash
# 1. Install the pinned Node version (skip if you already have Node 22.12+)
nvm install   # reads .nvmrc

# 2. Install dependencies (uses the committed package-lock.json)
npm ci

# 3. Start the dev server
npm run dev
# → http://localhost:4321

# 4. Type-check + lint-equivalent
npm run typecheck

# 5. Run the test suite
npm run test

# 6. Full production build (what CI runs)
npm run build
# → validates content, type-checks, builds to dist/

# 7. Preview the production build locally
npm run preview
```

The repo ships with real committed data in `src/data/generated/` (see
"Publications" and "News" below for how it was produced) plus **sample
placeholder people** in the People pipeline, so all of the above works with
zero credentials configured. You only need Google/OpenAlex credentials to
run a *live* sync (`npm run sync:people`, etc.) against fresh data.

Copy `.env.example` to `.env` to configure any of the sync scripts locally.
`.env` is git-ignored — never commit it.

---

## Public roster Sheet setup (no Cloud project)

This is the simplest option for the People page. It supports a fully automatic
Google Form → Google Drive photos + Google Sheets → website workflow, without
Google Cloud. Create the Form in **My Drive** (not a Shared Drive), add a
**File upload** question named `Profile Photo`, and link its responses to a
Google Sheet. Google Forms automatically creates a `Form name (File
responses)` Drive folder for the uploaded photos; set that folder to **Anyone
with the link → Viewer** so the sync can download and safely re-encode them.
Responders must sign in to a Google account to upload a file.

1. Give the Form questions these exact names: `Full Name`, `Role / Title`,
   `Category`, `Professional Website`, `Research Interests`, `Short Bio`,
   `Profile Photo`, `Status`, `Joined Year`, `Alumni Year`, `Current
   Position`, and `Current Institution`. The `Profile Photo`
   question must use the File upload type; the others can use the appropriate
   text or dropdown type.
2. In Google Sheets, select **File → Share → Publish to web**, choose the
   linked **Form Responses** tab, and publish it as CSV. The sync ignores the
   extra Timestamp column and reads the named fields directly, so new Form
   submissions flow to the site automatically.
3. Set `PUBLIC_GOOGLE_SHEET_ID` and `PUBLIC_GOOGLE_SHEET_GID` as repository
   variables in **Settings → Secrets and variables → Actions → Variables**.
   The Sheet ID is the part between `/d/` and `/edit` in its URL; the GID is
   the number after `gid=` in the tab URL (often `0`). They are public IDs,
   so they are variables rather than secrets.
4. No manual photo links or uploads are needed after the Form is configured:
   each uploaded image's Drive link arrives in the `Profile Photo` Sheet
   column. The sync downloads, validates, strips metadata, and re-encodes it
   before publishing.

The existing **Sync People** workflow reads this published CSV weekly, every
Sunday at 00:00 UTC. Run it manually from the GitHub Actions tab whenever an
update needs to appear sooner. This mode takes precedence whenever
`PUBLIC_GOOGLE_SHEET_ID` is set; you do not need Google Cloud, a service
account, or the private-sheet secrets. Every Form response and uploaded photo
link in this published tab is public, so restrict the Form to trusted people
and do not include internal notes or sensitive questions.

## Private Google setup (people pipeline)

The People page is powered by a tiny, admin-only Google Form → Sheet → Drive
→ GitHub Action pipeline. The **website never talks to Google directly** —
only the sync script does, at build time, using a read-only service account.

### 1. Create the Form

Create a Google Form with one question per field below (match these exact
column headers when the Form's responses land in the Sheet — the sync
script reads the Sheet, not the Form, so header spelling matters):

| Form field | Sheet column header | Notes |
|---|---|---|
| Slug (optional) | `Slug` | Lowercase kebab-case, e.g. `jane-doe`. Auto-derived from name if left blank. |
| Full name | `Full Name` | Required. |
| Role / title | `Role / Title` | Required, e.g. "PhD Scholar". |
| Category | `Category` | One of Faculty / PhD / MS / Project Staff / Interns (aliases like "PhD Scholar", "Project Associate" are normalized automatically — see `CATEGORY_ALIASES` in `scripts/sync-people.ts`). |
| Professional website | `Professional Website` | Must be `https://` — anything else is rejected at validation. |
| Research interests | `Research Interests` | Comma-separated. |
| Short bio (optional) | `Short Bio` | Plain text. |
| Profile photo | `Profile Photo` | Google Form file-upload question → lands as a Drive share link. |
| Display order | `Display Order` | Number; lower sorts first within a category. |
| Status | `Status` | `current` / `alumni` / `hidden`. Blank or unrecognized values default to `hidden` (safe default — nothing unreviewed goes live). |
| Joined year (optional) | `Joined Year` | |
| Alumni year (optional) | `Alumni Year` | |
| Current position (optional) | `Current Position` | Shown for alumni. |
| Current institution (optional) | `Current Institution` | Shown for alumni. |

Set the Form's file-upload question to save into a specific Drive folder —
that folder's ID is `GOOGLE_DRIVE_FOLDER_ID`.

Only the lab admin should have edit access to the Form. Keep the Sheet and
Drive folder **private** (not "anyone with the link").

### 2. Create the service account

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project, then **APIs & Services → Credentials → Create
   credentials → Service account**.
2. Enable the **Google Sheets API** and **Google Drive API** for that
   project.
3. Create a JSON key for the service account and download it. This file's
   entire contents (as one line) is your `GOOGLE_SERVICE_ACCOUNT_JSON`
   secret.
4. Share the response Sheet **and** the Drive upload folder with the service
   account's email address (`...@...iam.gserviceaccount.com`), Viewer
   access is enough — the sync only ever reads.

### 3. Configure secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**:

- `GOOGLE_SERVICE_ACCOUNT_JSON` — the full service-account JSON key.
- `GOOGLE_SHEET_ID` — the ID from the Sheet's URL
  (`docs.google.com/spreadsheets/d/<THIS PART>/edit`).
- `GOOGLE_DRIVE_FOLDER_ID` — the ID from the Drive folder's URL. Used as a
  defense-in-depth sanity check (`isFileInExpectedFolder` in
  `scripts/lib/google.ts`): a photo is only processed if its Drive file
  actually lives in this folder, guarding against a Form respondent pasting
  an unrelated Drive link into the photo field.

Never commit these values. `.env.example` lists the variable names only.

---

## People management

No source-code changes are needed for routine people management.

- **Add a person:** admin fills out the Google Form → row appears in the
  Sheet → wait for the weekly Sunday sync or trigger it manually:
  **Actions tab → "Sync People" → Run workflow**.
- **Update a person:** edit their row directly in the Sheet → next sync
  picks it up.
- **Move someone to Alumni:** set their `Status` cell to `alumni` (and fill
  in `Alumni Year` / `Current Position` / `Current Institution` if known).
  They disappear from their category's "current" grid and appear in the
  Alumni section automatically.
- **Temporarily hide someone:** set `Status` to `hidden`. They stop
  rendering anywhere on the site but stay in the Sheet.
- **Replace a photo:** re-submit the Form (or replace the file in Drive and
  update the cell) — the sync re-downloads, re-validates, and re-encodes it.

### How photos are handled safely

Uploaded photos are never served as-is. `scripts/lib/image.ts`:
checks the file's magic bytes (rejects anything that isn't a real
JPEG/PNG/WebP — no SVG, no HTML-as-image, no executables), decodes it with
`sharp` under a decompression-bomb pixel cap, strips all EXIF/metadata, crops
to a square, and re-encodes as WebP into `public/images/people/<slug>.webp`.
A rejected photo just means that person renders with an initials avatar —
it never blocks the rest of the sync.

### Running the sync locally

```bash
# with real credentials in .env:
npm run sync:people

# without credentials, this automatically falls back to
# scripts/fixtures/people.sample.json so the pipeline stays exercised:
npm run sync:people
```

---

## Publications

Publications are **never** hand-edited. `scripts/sync-publications.ts`:

1. Resolves Prof. Balaraman Ravindran's OpenAlex author record by **ORCID**
   (`0000-0002-5364-7639`), not by name matching.
2. Fetches all of his works from the OpenAlex API (no key required for this
   project's volume; set `OPENALEX_API_KEY` / `OPENALEX_MAILTO` to use a
   personal key for a higher polite-pool rate limit).
3. Filters out a known OpenAlex author-disambiguation data-quality issue —
   ~43 unrelated 1970s–2000s medical/parasitology papers by a different
   person that got merged into the same author ID. See
   `docs/legacy-content-map.md` for how this was discovered and verified.
4. Deduplicates: primarily by DOI, then by normalized title (catches the
   same paper appearing both as a preprint and a later DOI-bearing version).
5. Cross-checks against **DBLP** (`pid/69/2281`) to fill in missing venue
   metadata. DBLP is secondary/best-effort — if it's unreachable, the sync
   continues with OpenAlex data alone (`sourceStatus.dblp` records this).
6. Sorts newest-first and writes `src/data/generated/publications.json`.

**Failure policy:** if OpenAlex itself fails or returns nothing, the
previous `publications.json` is left untouched (never overwritten with an
empty file) and `sourceStatus.openalex` is marked `"stale"`.

Run it manually:

```bash
npm run sync:publications
```

The Publications page (`/publications`) does client-side search (title or
author), year filtering, type filtering, and four sort orders — all vanilla
TypeScript over the statically-rendered list (`src/components/PublicationList.astro`),
so it works even with JavaScript disabled (just without the controls).

---

## News

`scripts/sync-news.ts` searches Google News RSS for three queries
(`"Balaraman Ravindran"`, `"Balaraman Ravindran" "IIT Madras"`,
`"B. Ravindran" "IIT Madras"`) and keeps an item **only if the professor's
name appears verbatim in the headline** — either the full name, or the
short form alongside an institutional marker (IIT Madras / IITM / WSAI /
DSAI / RBCDSAI). This is deliberately conservative: RSS metadata gives no
article body to double-check relevance against, so headline-only false
positives are the bigger risk to guard against, per the project brief. No
article body is ever fetched or stored — only headline, source, date, and
the outbound link.

`news.json` is a **rolling store**: each run merges newly discovered items
into what's already there (Google News RSS only returns a recent window, so
treating each run as a fresh snapshot would silently drop older, still-valid
stories). If every RSS query fails, the previous `news.json` is kept as-is.

### Manual overrides

Edit `src/data/news-overrides.json` (hand-edited, not generated):

```json
{
  "excludedUrls": ["https://example.com/wrong-person-article"],
  "includedUrls": ["https://example.com/a-relevant-article-the-filter-missed"],
  "pinnedIds": []
}
```

- `excludedUrls` — remove a false positive without touching the filtering
  algorithm.
- `includedUrls` — manually add a known-relevant article the automated
  filter missed (the sync fetches just that page's `<title>` tag — never the
  body — to build its entry).
- `pinnedIds` — news item `id`s (from `news.json`) to always sort first.

Run it manually:

```bash
npm run sync:news
```

---

## Announcement popup

Fully configured from `src/data/site-config.json` → `announcement` — no
component code changes needed to run or change an announcement:

```json
{
  "announcement": {
    "enabled": true,
    "id": "seminar-2026-03",
    "title": "Upcoming seminar",
    "message": "Details about the seminar...",
    "ctaLabel": "Learn more",
    "ctaUrl": "https://example.com/seminar",
    "dismissible": true,
    "startAt": null,
    "endAt": null
  }
}
```

- Set `enabled: false` to show nothing.
- A dismissal is remembered in the visitor's `localStorage`, keyed by `id` —
  **change `id`** whenever you want a previously-dismissed announcement (or
  a brand new one) to show again.
- `startAt` / `endAt` (ISO date strings, or `null`) optionally bound when it
  displays.
- `ctaUrl` must be `https://` — anything else is rejected by the schema
  (`npm run validate:content` catches a bad config before it ships).
- Built on the native `<dialog>` element: focus-trapped, Escape closes it
  (unless `dismissible: false`), and it's screen-reader accessible.

---

## Preview protection

**Threat model:** this is a temporary, low-friction deterrent to keep casual
visitors and search engines from seeing the redesign before the professor
approves it. It is client-side static encryption
([staticrypt](https://github.com/robinmoisson/staticrypt)), **not**
server-side identity-based access control — anyone who has the URL can still
download the encrypted page; they just can't read it without the password.
Don't use it for anything actually sensitive.

**To enable:**

1. Repo **Settings → Secrets and variables → Actions → Secrets** → add
   `PREVIEW_PASSWORD` with a long, high-entropy password (e.g. generate one
   with `openssl rand -base64 24`). Never commit this value anywhere.
2. Repo **Settings → Secrets and variables → Actions → Variables** → add
   `PREVIEW_PROTECTED` = `true`.
3. Deploy. `dist/**/*.html` is encrypted in the CI build before it's
   uploaded to Pages; visitors see a password prompt.

**To permanently disable (after professor approval):** set the
`PREVIEW_PROTECTED` repository variable to `false` (or delete it) and
redeploy. That one switch is the entire toggle — no code changes, and the
`PREVIEW_PASSWORD` secret can be safely deleted afterwards too.

The password itself never appears in the repository, in generated config,
in git history, or in build logs — it only ever exists as a GitHub Actions
secret, injected as an environment variable for the one `staticrypt` step.

---

## Cache / stale-deploy handling

GitHub Pages gives us no CDN purge control, so staleness is handled by
versioning, not cache-busting tricks:

- Astro hashes JS/CSS filenames on every build, so old assets simply aren't
  referenced by new HTML.
- `scripts/generate-build-version.ts` writes `public/build-version.json`
  (git SHA + build timestamp) before every build.
- `src/components/VersionCheck.astro` fetches `/build-version.json` with
  `cache: "no-store"` on load, on tab focus, on `visibilitychange`, and
  every 10 minutes, and shows a small "New version available — Reload"
  toast (never an automatic reload, and never more than once per detected
  change) if the commit SHA differs from what the page loaded with.

No service worker, no PWA — deliberately, since those introduce their own
stale-cache failure modes.

---

## Deployment

The site deploys via `.github/workflows/deploy.yml` using GitHub's official
Pages Actions (`upload-pages-artifact` + `deploy-pages`), triggered by:

- a push to `main`,
- manual `workflow_dispatch`, or
- an explicit dispatch from a successful sync workflow (see below).

### One-time repo setup (before the first deploy)

1. Repo **Settings → Pages → Source** → select **"GitHub Actions"** (not
   "Deploy from a branch").
2. Because this repo is `InteractiveIntelligenceLab/InteractiveIntelligenceLab.github.io` (an
   org-level Pages repo), it deploys to `https://interactiveintelligencelab.github.io/` at the
   domain root — no `base` path configuration needed (already reflected in
   `astro.config.mjs`).
3. Configure the Google/OpenAlex secrets described above if you want the
   scheduled sync workflows to run against live data (they work with
   fixture/cached data otherwise).
4. Push to `main` (or run `Deploy` via **Actions → Run workflow**).

### Why sync workflows explicitly re-trigger deploy

A push made with the default `GITHUB_TOKEN` (which is what
`sync-people.yml` etc. use to commit updated data) does **not** trigger
other `on: push` workflows — this is a deliberate GitHub anti-recursion
protection, not a bug. So each sync workflow's last step explicitly runs
`gh workflow run deploy.yml` only when it actually committed a change. This
avoids both "the site never updates after a sync" and "an infinite loop of
workflows triggering each other."

### Optional: instant sync via Google Apps Script

GitHub's `schedule` trigger can lag by several minutes under platform load,
so people-page updates land within roughly the next scheduled run (~20 min),
not instantly. If the lab wants near-instant updates after a Form
submission, you can optionally add a Google Apps Script trigger (bound to
the Form's "On form submit" event) that calls the GitHub
[`workflow_dispatch` REST API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
for `sync-people.yml`, using a fine-grained GitHub PAT (Actions: write only,
scoped to this repo) stored in Apps Script's own secret storage. This is
**not required for V1** — the scheduled sync is sufficient on its own — but
is documented here in case it's ever wanted.

---

## Testing

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

Covers: schema validation (people/publications/news/site-config, including
malformed dates and disallowed URL schemes), category/status normalization,
duplicate-slug and duplicate-publication-id detection, publication
deduplication (including the "preprint gets a DOI later" case) and sorting,
the OpenAlex contamination filter, news headline-confidence filtering and
id/URL-based deduplication, announcement schema business rules, build-version
payload shape, and integration checks against the real committed
`src/data/generated/*.json` files (so a bad manual edit or a sync-script
regression is caught, not just a bad unit test fixture).

---

## Troubleshooting

**`npm run build` fails on `validate:content`**
Read the specific error — it names the file and field. Most often this
means a hand-edited file (`site-config.json`, `news-overrides.json`,
`categories.json`) has a typo. Re-run `npm run validate:content` alone for a
faster loop while fixing it.

**A sync workflow ran but the site didn't update**
Check the workflow's "Check for changes" step — if it found no diff, there
was genuinely nothing new (this is normal, not a bug). If there *was* a
diff, check the "Trigger deployment" step succeeded, then check the Deploy
workflow's own run.

**Google sync fails with an auth error**
`GOOGLE_SERVICE_ACCOUNT_JSON` is usually the culprit — re-copy the full JSON
key as a single line into the GitHub secret, and confirm the service
account's email has been shared on both the Sheet and the Drive folder.

**A person's photo isn't showing**
Check the sync run's logs for a warning like `photo rejected/failed (...)`
— the image likely failed the raster-format/size validation in
`scripts/lib/image.ts`. The person still renders (with an initials avatar);
fix by re-uploading a plain JPEG/PNG/WebP under the size limit.

**Publications look wrong / missing after a sync**
Check `sourceStatus` in `src/data/generated/publications.json` — if
`openalex` is `"stale"`, OpenAlex was unreachable and the previous good data
was intentionally kept. Re-run the workflow later, or `npm run
sync:publications` locally once OpenAlex is reachable again.

**News is picking up an unrelated person**
Add the offending URL to `excludedUrls` in `src/data/news-overrides.json`
and re-run the sync — this doesn't require touching the filtering logic. If
it's a *pattern* of false positives, see `isHighConfidence()` in
`scripts/sync-news.ts`.

**The preview password isn't prompting / is stuck showing the old site**
Confirm the `PREVIEW_PROTECTED` repository *variable* is `true` and
`PREVIEW_PASSWORD` *secret* is set, then re-run the Deploy workflow —
GitHub Pages doesn't apply changes until the next deploy completes.

**Astro type-check fails after adding a new field to a JSON data file**
Update the corresponding Zod schema in `src/lib/schemas.ts` first — it's the
single source of truth every page/component/script types against.
