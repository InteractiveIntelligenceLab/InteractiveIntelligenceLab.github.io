#!/usr/bin/env tsx
// Writes public/build-version.json before every build so the client-side
// VersionCheck component (src/components/VersionCheck.astro) can detect a
// newer deployment and prompt the visitor to reload — see spec section 35.
// Must run BEFORE `astro build` so the file is copied from public/ into dist/.
import { execSync } from "node:child_process";
import { writeJsonDeterministic } from "./lib/fs-json.js";

export function getCommitSha(): string {
  if (process.env.GIT_COMMIT_SHA) return process.env.GIT_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "local";
  }
}

export interface BuildVersion {
  commit: string;
  builtAt: string;
}

export function buildVersionPayload(commit: string, now: Date = new Date()): BuildVersion {
  return { commit, builtAt: now.toISOString() };
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const buildVersion = buildVersionPayload(getCommitSha());
  writeJsonDeterministic("public/build-version.json", buildVersion);
  console.log(`[generate-build-version] commit=${buildVersion.commit} builtAt=${buildVersion.builtAt}`);
}
