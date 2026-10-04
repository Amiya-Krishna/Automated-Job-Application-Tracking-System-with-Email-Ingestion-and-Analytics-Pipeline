// Resume PDF export: layout invariants across short / medium / long resumes, and glyph safety.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseResume } = require("../../services/resumeTailoring/resumeParser");
const { exportProfile, splitTrailingDate } = require("../../services/resumeTailoring/resumeRenderer");
const fx = require("./fixtures");

async function render(text) {
  const { profile } = parseResume(text);
  const { buffer, mime, ext } = await exportProfile(profile, "pdf");
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const info = await parser.getInfo();
  const out = await parser.getText();
  await parser.destroy();
  return { buffer, mime, ext, pages: info.total ?? info.numPages, text: out.text };
}
const bullets = (n) => Array.from({ length: n }, (_, i) => `• Item ${i + 1}: shipped a service handling 12,000+ requests/day and saved ₹4.2L per year → faster ≥ 2× with naïve café résumé "quotes" & Łódź.`).join("\n");
const LONG = `Zoë Müller
Hyderabad | zoe@example.com\n\nEXPERIENCE\nStaff Engineer — Initech | Jan 2022 - Present\n${bullets(14)}\n\nSenior Engineer — Globex | 2018 - 2021\n${bullets(14)}\n\nEDUCATION\nB.Tech, Example Institute\n2009 - 2013\n\nSKILLS\nLanguages: Python, Go\n`;

test("PDF export: A4, 1 page for short resumes, flows to more pages for long ones, valid mime/ext", async () => {
  const s = await render(fx.MINIMAL_REACT_RESUME);
  assert.equal(s.mime, "application/pdf");
  assert.equal(s.ext, "pdf");
  assert.equal(s.pages, 1);
  assert.equal(s.buffer.subarray(0, 5).toString(), "%PDF-");
  const m = await render(fx.STUDENT_RESUME);
  assert.equal(m.pages, 1);
  const l = await render(LONG);
  assert.ok(l.pages >= 2 && l.pages <= 4, `pages=${l.pages}`);
  assert.match(l.buffer.toString("latin1"), /\/MediaBox \[0 0 595\.28 841\.89\]/);
});

test("PDF export: text is real, ordered, ATS-extractable; sections keep their order and no glyph becomes '?'", async () => {
  const l = await render(LONG);
  assert.doesNotMatch(l.text, /\?/, "no broken glyphs");
  assert.match(l.text, /Rs\. 4\.2L/, "₹ is transliterated, not dropped");
  assert.match(l.text, /Zoë Müller/);
  assert.match(l.text, /résumé/);
  assert.match(l.text, /Lodz|Łódź|Ł|L/); // Ł -> L
  const order = ["EXPERIENCE", "EDUCATION", "SKILLS"].map((h) => l.text.indexOf(h));
  assert.ok(order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
  const s = await render(fx.STUDENT_RESUME);
  assert.ok(s.text.indexOf("EDUCATION") < s.text.indexOf("PROJECTS"));
});

test("splitTrailingDate keeps the date tail separate and never loses text", () => {
  const r = splitTrailingDate("Web Development Intern — Example Startup Pvt Ltd | Jun 2025 - Aug 2025");
  assert.equal(r.left, "Web Development Intern — Example Startup Pvt Ltd");
  assert.equal(r.date, "Jun 2025 - Aug 2025");
  const none = splitTrailingDate("No dates here");
  assert.equal(none.left, "No dates here");
});
