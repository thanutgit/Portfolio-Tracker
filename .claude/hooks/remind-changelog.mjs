#!/usr/bin/env node
// Stop hook: run every time Claude Code finishes a response.
// Checks git status — if substantive files changed (code or migrations)
// but CHANGELOG.md wasn't touched in the same set of changes, block
// stopping and ask Claude to update it first.
//
// Self-clearing: once Claude edits CHANGELOG.md, this check passes and
// won't fire again for the same changes.

import { execSync } from "node:child_process";

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    // if we can't parse input, don't block — fail open
    process.exit(0);
  }

  // Avoid infinite loop: if this hook already blocked once this turn,
  // Claude Code sets stop_hook_active — don't block again.
  if (input.stop_hook_active) {
    process.exit(0);
  }

  let status = "";
  try {
    status = execSync("git status --porcelain", {
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      encoding: "utf8",
    });
  } catch {
    // not a git repo yet, or git not available — nothing to check
    process.exit(0);
  }

  const changedFiles = status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim());

  const touchesSubstantiveCode = changedFiles.some(
    (f) => f.startsWith("src/") || /^migrations\/.*\.sql$/.test(f)
  );
  const touchedChangelog = changedFiles.some((f) => f === "CHANGELOG.md");

  if (touchesSubstantiveCode && !touchedChangelog) {
    process.stderr.write(
      "Code or schema files changed this turn, but CHANGELOG.md wasn't " +
      "updated. Add an entry to CHANGELOG.md describing what changed, then " +
      "finish.\n"
    );
    process.exit(2); // 2 = block stopping, show this message to Claude
  }

  process.exit(0);
});
