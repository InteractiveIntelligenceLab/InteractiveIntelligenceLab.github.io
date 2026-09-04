# Legacy content migration map

This records where every piece of professor-approved prose on the new site
came from on the old site (https://rise-iil.github.io/), what was changed
and why, and what was deliberately **not** migrated. Keep this up to date if
you move prose around later — it's the paper trail for "why does this page
say that."

Global rules applied everywhere below:

- **Lab name**: "Integrated Intelligence Laboratory" (a typo/inconsistency on
  the old site) → **"Interactive Intelligence Lab"** everywhere.
- **Email**: `ilds@cse.iitm.ac.in` → **`iil@dsai.iitm.ac.in`** everywhere it
  appeared as a lab/contact address. Personal emails were never present on
  the old site's static pages, so none were touched.

## Home (`/` ← `rise-iil.github.io/`)

| Section | Status | Notes |
|---|---|---|
| Four research-area one-liners (Networks, RL, NLP, CV) | **Preserved verbatim** | Exact wording specified in the build brief; reproduced in `src/pages/index.astro`. |
| "Recent news" (2017 items: Kamakoti AI task force, Nema Google PhD Fellowship) | **Dropped** | Stale 2017 content. Replaced by the automated `scripts/sync-news.ts` pipeline — see `src/data/generated/news.json`. |
| "Recent publications" | **Dropped** | Replaced by the automated OpenAlex/DBLP pipeline — see `src/data/generated/publications.json`. |
| Footer "© 2017" | **Replaced** | Footer now computes the year at build time (`src/components/Footer.astro`). |

## About (`/about`)

| Section | Status | Notes |
|---|---|---|
| "About Us" paragraph | **Preserved**, with lab-name fix | Original: "Integrated Intelligence Laboratory (IIL) is an interdisciplinary research group…". Only "Integrated Intelligence Laboratory" → "Interactive Intelligence Lab" changed; rest verbatim. |
| "Our Vision" paragraph | **Preserved verbatim** | No changes. |
| "Reach us" address | **Preserved**, reformatted | Same address text, rendered as a proper `<address>` block with the new email. |

## Research (`/research`)

| Old page | Status | Notes |
|---|---|---|
| `/research` intro line | **Preserved verbatim** | "The research conducted at IIL spans a plethora of fields and has a wide impact." |
| `/research` — Reinforcement Learning paragraph | **Preserved verbatim** | Full paragraph migrated. |
| `/research` — Networks paragraph | **Preserved verbatim** | Full paragraph migrated. |
| `/research` — Natural Language Processing paragraph | **Preserved verbatim** | Full paragraph migrated. |
| `/research` — Computer Vision paragraph | **Preserved verbatim** | Full paragraph migrated. |
| `/sg_rl`, `/sg_networks`, `/sg_nlp`, `/sg_cv` — team rosters | **Dropped** | Stale rosters (2017-18 students, most now alumni or ungraded). Current people now come exclusively from the Google Sheets pipeline — see "People" below. |
| `/sg_rl`, `/sg_networks`, `/sg_nlp`, `/sg_cv` — descriptive prose | **Consolidated, not duplicated** | These four subgroup pages largely restated the same descriptions already captured verbatim on `/research`; rather than forking near-duplicate prose across four new routes, the new site keeps one `/research` page with anchor sections (`#reinforcement-learning`, `#networks`, `#nlp`, `#computer-vision`). This was a "cleaner UX" call permitted by the brief (single page vs. four routes) — no substantive content was lost, only the redundant restatement was not re-duplicated. |

**Why one `/research` page instead of four routes:** the brief explicitly allowed either `/research/<area>` routes or "well-designed anchor sections under `/research`, whichever produces the cleaner UX." Anchor sections were chosen because the four descriptions are short, the homepage already links to `/research#<slug>` per area, and it avoids four near-empty route files.

## People (`/people`)

| Item | Status | Notes |
|---|---|---|
| Old people roster (Faculty: Ravindran, Khapra, Guruprasad; ~30 students) | **Not migrated as current data** | Per the brief, the old roster is stale reference material only, not a source of truth. |
| Prof. Balaraman Ravindran (Faculty) | **Re-added as real, verified data** | He is independently confirmed as current faculty (Head, Wadhwani School of Data Science and AI) via the live `wsai.iitm.ac.in/faculty/b-ravindran/` profile, and is the named subject of the publications/news pipelines. Seeded in `scripts/fixtures/people.sample.json`. |
| Dr. Mitesh Khapra, Dr. Harish Guruprasad, and all ~30 listed students | **Not carried forward** | No authoritative current-affiliation source was available for this migration; they are exactly the kind of stale roster entries the brief says must come from the new Google Sheets pipeline instead of being guessed at. If any are still affiliated with the lab, they should be (re-)added through the admin Google Form. |
| PhD/MS/Project Staff/Intern/Alumni sample entries | **Placeholder fixture data** | Clearly labeled "Sample …" entries exist only so the category system, Alumni section, and hidden-status filtering have something real to render and test locally before the Google Form pipeline is connected. They must be replaced by real submissions before the site goes live — see README.md "People management". |

## Publications (`/publications`)

**Entirely replaced** by the automated pipeline (`scripts/sync-publications.ts`), per the brief — the old static list was manually maintained and stale. Source of truth is now OpenAlex (primary, via ORCID `0000-0002-5364-7639`) cross-checked against DBLP (`pid/69/2281`).

**Data-quality finding, documented for future maintainers:** OpenAlex's author-disambiguation record for this ORCID (`A5009374923`) is contaminated with ~43 unrelated 1975–2004 parasitology/immunology papers by a different, unrelated "B Ravindran" (a medical researcher — malaria/filariasis vaccine research, no shared institution, topics completely disjoint from CS/ML). This was discovered by inspecting the raw API response, not assumed. `scripts/sync-publications.ts` filters these out via `isUnrelatedField()` using OpenAlex's own topic/concept classification (see `UNRELATED_TOPIC_KEYWORDS` in that file) rather than by year cutoff, since Prof. Ravindran does have genuine CS publications going back to 1994. This filter is covered by `tests/publications.test.ts`.

## News (`/news`)

**Entirely replaced** by the automated pipeline (`scripts/sync-news.ts`), per the brief — the old site's 2017 news items are stale. Source is Google News RSS, filtered conservatively (professor's name must appear verbatim in the headline) to avoid false positives, since RSS metadata gives no article body to double-check against.

## Join Us (`/join-us` ← `/_pages/4_OpenPositions.html`)

All four sections (Post-doctoral fellows, Project Assistants/Associates, PhD/MS, Internships) are **preserved verbatim**, sourced from the raw HTML of the original page (not a paraphrased extraction), with only the email address swapped. Link-by-link:

| Original link text | Old URL | Status | New destination |
|---|---|---|---|
| "here" (postdoc details) | `iitm.ac.in/content/post-doctoral-fellowship-iit-madras` | **Moved** — 301-redirects to the new URL | `https://www.iitm.ac.in/careers/post-doctoral-opportunities` (the exact URL supplied in the brief; confirmed as the redirect target). |
| "special fellowships" (women postdoc candidates) | `iitm.ac.in/content/post-doctoral-fellowship-iitm-women` | **Dead** — returns 200 but silently lands on the IITM homepage (soft-404); no page-specific replacement found | Pointed at the same current postdoc-opportunities hub page above (the closest obvious authoritative source for current fellowship info, women-specific programs included), rather than left dangling or invented. |
| "Interdisciplinary Research Programme (IDRP) at IIT Madras" | `sites.google.com/a/smail.iitm.ac.in/iitm-idrp/apply` | **Dead** — redirects to a Google account sign-in wall, i.e. no longer a public application page | **De-linked.** Per the brief ("if demonstrably obsolete, do not pretend it is current… retain the text but do not invent a destination"), the text is kept but is no longer a hyperlink. No replacement URL was invented. |
| "IIT Madras website" (general PhD/MS applications) | *(no link in the original — plain text)* | Unchanged | Kept as plain text, matching the original (never linked). |

## Global links validated across the site

| Link | Status |
|---|---|
| `https://www.iitm.ac.in/` | OK (200) |
| `https://www.cse.iitm.ac.in/` | OK (200) |
| `https://www.iitm.ac.in/careers/post-doctoral-opportunities` | OK (200) |
| `https://wsai.iitm.ac.in/faculty/b-ravindran/` | OK (200) — used as Prof. Ravindran's professional link (more current than the old `cse.iitm.ac.in/~ravi/` page, which still resolves but is the legacy department-hosted profile). |

All of these (plus every people/publication/news URL) are re-checked automatically by `scripts/check-links.ts` / `.github/workflows/link-check.yml` going forward.
