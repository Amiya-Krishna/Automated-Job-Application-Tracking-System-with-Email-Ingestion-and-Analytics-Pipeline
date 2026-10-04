const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeJobUrl, isLinkableUrl } = require("../../services/jobUrl");

test("valid job links are kept, tracking params and fragments removed", () => {
  assert.equal(normalizeJobUrl("https://www.linkedin.com/jobs/view/3912345678/?trackingId=a&refId=b#x"), "https://www.linkedin.com/jobs/view/3912345678/");
  assert.equal(normalizeJobUrl("https://in.indeed.com/viewjob?jk=abc123&utm_source=x&from=serp"), "https://in.indeed.com/viewjob?jk=abc123&from=serp");
  assert.equal(normalizeJobUrl("  https://unstop.com/jobs/dev-123?utm_campaign=z "), "https://unstop.com/jobs/dev-123");
});
test("unsafe / invalid / missing values become null instead of failing the save", () => {
  for (const v of ["javascript:alert(1)", "data:text/html,x", "ftp://x.com/a", "not a url", "", null, undefined, 42, "https://user:pw@x.com/a", "https://localhost/a"]) {
    assert.equal(normalizeJobUrl(v), null, String(v));
  }
});
test("over-long URLs drop the query; still-too-long ones are rejected", () => {
  const long = "https://example.com/job/1?x=" + "a".repeat(1500);
  assert.equal(normalizeJobUrl(long), "https://example.com/job/1");
  assert.equal(normalizeJobUrl("https://example.com/" + "a".repeat(1100)), null);
});
test("isLinkableUrl never allows internal placeholders or non-http schemes", () => {
  assert.equal(isLinkableUrl("https://a.com/x"), true);
  assert.equal(isLinkableUrl("internal://manual-tracked-job/4"), false);
  assert.equal(isLinkableUrl("javascript:alert(1)"), false);
});
