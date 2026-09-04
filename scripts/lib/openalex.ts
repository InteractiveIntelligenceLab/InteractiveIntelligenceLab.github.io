// Thin client for the parts of the OpenAlex API this project needs.
// Docs: https://docs.openalex.org/. No API key is required for this
// project's tiny request volume (one author, run on a schedule); if
// OPENALEX_API_KEY is set it is forwarded for a higher rate-limit tier.
import { fetchWithRetry } from "./http.js";

const API_ROOT = "https://api.openalex.org";

export interface OpenAlexAuthor {
  id: string;
  display_name: string;
  works_api_url: string;
}

export interface OpenAlexWork {
  id: string;
  title: string | null;
  display_name: string | null;
  publication_date: string | null;
  publication_year: number | null;
  type: string | null;
  doi: string | null;
  authorships: Array<{ author: { id: string; display_name: string } }>;
  primary_location: {
    source: { display_name: string | null } | null;
    landing_page_url: string | null;
    is_oa: boolean | null;
  } | null;
  open_access: { is_oa: boolean; oa_url: string | null } | null;
  best_oa_location: { landing_page_url: string | null; pdf_url: string | null } | null;
  primary_topic: { display_name: string | null } | null;
  concepts: Array<{ display_name: string }>;
}

function withPoliteParams(url: URL) {
  const apiKey = process.env.OPENALEX_API_KEY;
  const mailto = process.env.OPENALEX_MAILTO;
  if (apiKey) url.searchParams.set("api_key", apiKey);
  if (mailto) url.searchParams.set("mailto", mailto);
  return url;
}

export async function fetchAuthorByOrcid(orcid: string): Promise<OpenAlexAuthor | undefined> {
  const url = withPoliteParams(
    new URL(`${API_ROOT}/authors?filter=orcid:${encodeURIComponent(orcid)}`),
  );
  const res = await fetchWithRetry(url.toString(), { retries: 3 });
  const data = (await res.json()) as { results: OpenAlexAuthor[] };
  return data.results[0];
}

/** Fetches every work for an author via cursor pagination (OpenAlex caps per-page at 200). */
export async function fetchAllWorksForAuthor(authorId: string): Promise<OpenAlexWork[]> {
  const works: OpenAlexWork[] = [];
  let cursor = "*";
  const authorIdShort = authorId.replace("https://openalex.org/", "");

  while (cursor) {
    const url = withPoliteParams(
      new URL(
        `${API_ROOT}/works?filter=author.id:${authorIdShort}&sort=publication_date:desc&per-page=200&cursor=${encodeURIComponent(cursor)}`,
      ),
    );
    const res = await fetchWithRetry(url.toString(), { retries: 3 });
    const data = (await res.json()) as {
      results: OpenAlexWork[];
      meta: { next_cursor: string | null };
    };
    works.push(...data.results);
    cursor = data.meta.next_cursor ?? "";
    if (!cursor) break;
  }
  return works;
}
