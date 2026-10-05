// The extension's Sources tab shows the signed-in user's OWN sources only (Manual / Gmail /
// Extension). Visibility is enforced by GET /api/sources on the server; the extension never
// calls an admin route and never filters or decides visibility itself.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");

test("dashboard has a Sources tab, panel and loader that call the user-scoped /sources API", () => {
  const html = read("dashboard.html");
  assert.match(html, /data-tab="sourcesTab"/);
  assert.match(html, /id="sourcesTab"/);
  assert.match(html, /id="sourcesBody"/);
  const js = read("dashboard.js");
  assert.match(js, /apiAuth\("\/sources"\)/);
  assert.match(js, /targetId === "sourcesTab"\) loadSources\(\)/);
});

test("the extension never calls admin-only APIs", () => {
  for (const f of ["dashboard.js", "background.js", "popup.js", "resume-manager.js", "resume-api.js", "content.js"]) {
    assert.doesNotMatch(read(f), /["'`]\/admin\b|\/api\/admin|\/scrape\b/, f);
  }
});
