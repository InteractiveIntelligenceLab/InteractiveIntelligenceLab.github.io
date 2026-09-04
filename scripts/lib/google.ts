// Read-only Google Sheets + Drive access via a service account. Credentials
// come only from the GOOGLE_SERVICE_ACCOUNT_JSON env var (a GitHub Actions
// secret in CI, an untracked .env locally) — never written to disk, never
// logged. See README.md "Google setup" for how to create/share this account.
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

export function hasGoogleCredentials(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SHEET_ID);
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  let credentials: { client_email: string; private_key: string };
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
  });
}

/** Reads a sheet and returns rows as header-keyed objects (row 1 = headers). */
export async function readSheetRows(
  sheetId: string,
  range = "Form Responses 1",
): Promise<Record<string, string>[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const rows = res.data.values ?? [];
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body.map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key: string, i: number) => {
      record[String(key).trim()] = row[i] !== undefined ? String(row[i]) : "";
    });
    return record;
  });
}

/** Accepts a bare Drive file ID or any of Drive's share-link URL shapes. */
export function extractDriveFileId(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes("/")) return trimmed;
  const patterns = [/\/d\/([a-zA-Z0-9_-]{10,})/, /[?&]id=([a-zA-Z0-9_-]{10,})/];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Sanity check, not an access-control boundary (the service account already
 * only has read access to what's been explicitly shared with it): confirms
 * a Drive file id extracted from a Sheet cell actually lives in the expected
 * upload folder before we spend a download+decode on it. Guards against a
 * Form respondent pasting an arbitrary unrelated Drive link into the photo
 * field. Returns true (fails open) when GOOGLE_DRIVE_FOLDER_ID isn't set,
 * since the folder check is a defense-in-depth extra, not a requirement.
 */
export async function isFileInExpectedFolder(fileId: string): Promise<boolean> {
  const expectedFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!expectedFolderId) return true;
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  try {
    const res = await drive.files.get({ fileId, fields: "parents" });
    const parents = res.data.parents ?? [];
    return parents.includes(expectedFolderId);
  } catch {
    return false;
  }
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}
