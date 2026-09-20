const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("zlib");
const { extractResumeText, inspectZip } = require("../../services/resumeTailoring/fileExtract");
const { exportProfile } = require("../../services/resumeTailoring/resumeRenderer");
const { parseResume } = require("../../services/resumeTailoring/resumeParser");
const fx = require("./fixtures");

const rejects = (buf, name, status, code) => assert.rejects(extractResumeText(buf, { fileName: name }), (e) => e.status === status && (!code || e.code === code));

test("PDF and DOCX round-trip losslessly through export -> upload -> parse", async () => {
  const src = parseResume(fx.STUDENT_RESUME);
  for (const fmt of ["pdf", "docx"]) {
    const { buffer } = await exportProfile(src.profile, fmt);
    const { text, format } = await extractResumeText(buffer, { fileName: `cv.${fmt.toUpperCase()}` });
    assert.equal(format, fmt);
    const again = parseResume(text);
    assert.equal(again.quality.reliable, true);
    assert.deepEqual(again.facts.map((f) => f.text).sort(), src.facts.map((f) => f.text).sort(), `${fmt} facts differ`);
  }
});

test("file validation: extension/magic mismatch, wrong types, empty, oversize, legacy .doc", async () => {
  await rejects(Buffer.from("MZ\x90\x00 evil".padEnd(400, "x")), "resume.pdf", 400, "invalid_file");
  await rejects(Buffer.from("%PDF-1.4 but named docx".padEnd(400, " ")), "resume.docx", 400, "invalid_file");
  await rejects(Buffer.from("plain text"), "resume.txt", 415, "unsupported_type");
  await rejects(Buffer.from("x"), "resume.doc", 415, "unsupported_type");
  await rejects(Buffer.from("x"), "resume", 415);
  await rejects(Buffer.alloc(0), "a.pdf", 400, "empty_file");
  await rejects(Buffer.alloc(2 * 1024 * 1024 + 1, 0x25), "big.pdf", 413, "file_too_large");
});

test("scanned/empty-text PDFs are reported as unreadable rather than guessed at", async () => {
  const PDFDocument = require("pdfkit");
  const chunks = [];
  const doc = new PDFDocument();
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((r) => doc.on("end", r));
  doc.rect(50, 50, 100, 100).stroke(); // graphics only, no text
  doc.end(); await done;
  await rejects(Buffer.concat(chunks), "scan.pdf", 422, "parse_failed");
});

test("corrupt PDF and truncated DOCX fail cleanly", async () => {
  await rejects(Buffer.from("%PDF-1.4\n garbage garbage garbage".padEnd(500, "g")), "c.pdf", 422, "parse_failed");
  const { buffer } = await exportProfile(parseResume(fx.STUDENT_RESUME).profile, "docx");
  await assert.rejects(extractResumeText(buffer.subarray(0, buffer.length - 40), { fileName: "c.docx" }), (e) => e.status === 400 || e.status === 422);
});

// Builds a minimal zip whose central directory DECLARES a huge uncompressed size.
function fakeZip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const { name, declared, data } of entries) {
    const nameB = Buffer.from(name);
    const comp = zlib.deflateRawSync(data || Buffer.from("x"));
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(declared, 22); lh.writeUInt16LE(nameB.length, 26);
    locals.push(lh, nameB, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(declared, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals); const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test("zip-bomb style DOCX is rejected from its directory, before anything is inflated", async () => {
  const bomb = fakeZip([{ name: "word/document.xml", declared: 900 * 1024 * 1024 }]);
  assert.ok(bomb.length < 1024);
  await rejects(bomb, "bomb.docx", 400, "docx_too_large");
  const many = fakeZip(Array.from({ length: 600 }, (_, i) => ({ name: `f${i}.xml`, declared: 10 })));
  await rejects(many, "many.docx", 400, "docx_too_complex");
  await rejects(fakeZip([{ name: "../evil.xml", declared: 10 }, { name: "word/document.xml", declared: 10 }]), "slip.docx", 400, "invalid_docx");
  await rejects(fakeZip([{ name: "other.xml", declared: 10 }]), "notword.docx", 400, "invalid_docx");
  assert.deepEqual(inspectZip(fakeZip([{ name: "word/document.xml", declared: 10 }])), { entries: 1, total: 10 });
});
