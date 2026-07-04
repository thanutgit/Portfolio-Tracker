#!/usr/bin/env node
// PreToolUse hook: block the agent from reading or editing .env files.
// Claude Code sends the tool call as JSON on stdin. We look at the target
// path (or the bash command), and if it touches a real .env file we exit 2,
// which tells Claude Code to block the call and show our message instead.

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let target = "";
  try {
    const input = JSON.parse(raw);
    const ti = input.tool_input || {};
    // file tools expose file_path; the Bash tool exposes command
    target = ti.file_path || ti.command || "";
  } catch {
    target = "";
  }

  // Template files are safe placeholders (no secrets) — always allow them.
  const isTemplate = /\.env\.(example|sample|template)(\W|$)/.test(target);
  // Any reference to a real .env file (.env, .env.local, /.env, "cat .env" ...)
  const touchesEnv = /\.env(\W|$)/.test(target);

  if (touchesEnv && !isTemplate) {
    process.stderr.write(
      "Blocked: .env files hold secrets (e.g. your Supabase secret key) and " +
      "must not be read or edited by the agent. Add the values there yourself; " +
      "use .env.example for shared placeholders.\n"
    );
    process.exit(2); // 2 = block this tool call
  }

  process.exit(0); // 0 = allow
});
