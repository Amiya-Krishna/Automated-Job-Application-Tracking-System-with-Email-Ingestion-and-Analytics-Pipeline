// Extracts plain text from an uploaded resume (PDF or DOCX). The file is
// untrusted input, so it is validated BEFORE any parser touches it:
//   * size cap
//   * extension AND magic bytes must agree (a renamed .exe is not a .pdf)
//   * DOCX = ZIP: the central directory is scanned first (entry count, total
//     declared uncompressed size, required word/document.xml) so a
//     decompression bomb is rejected before mammoth inflates anything
//   * PDF: page cap, encrypted PDFs rejected
//   * nothing is ever executed or written to disk

const { LIMITS, MSG } = require("./constants");
const { baseClean } = require("./textSanitize");
const { stripHtml } = require("../textUtils");

class UploadError extends Error {
  constructor(message, code = "invalid_file", status = 400) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.status = status;
  }
}

const ext = (name = "") => (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";

/** Scan a ZIP's central directory without inflating anything. */
function inspectZip(buf) {
  const eocdSig = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i -= 1) {
    if (buf.readUInt32LE(i) === eocdSig) { eocd = i; break; }
  }
  if (eocd === -1) throw new UploadError("This file is not a valid DOCX document.", "invalid_docx");
  const entries = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (entries > LIMITS.MAX_ZIP_ENTRIES) throw new UploadError("This document has too many parts to process safely.", "docx_too_complex");
  let total = 0;
  const names = [];
  for (let i = 0; i < entries; i += 1) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) throw new UploadError("This file is not a valid DOCX document.", "invalid_docx");
    const uncompressed = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    total += uncompressed;
    if (total > LIMITS.MAX_ZIP_UNCOMPRESSED_BYTES) throw new UploadError("This document expands to an unsafe size.", "docx_too_large");
    if (name.includes("..") || name.startsWith("/")) throw new UploadError("This document contains unsafe paths.", "invalid_docx");
    names.push(name);
    off += 46 + nameLen + extraLen + commentLen;
  }
  if (!names.includes("word/document.xml")) throw new UploadError("This file is not a Word (.docx) document.", "invalid_docx");
  return { entries, total };
}

async function extractPdf(buf) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const info = await parser.getInfo?.().catch(() => null);
    const pages = info?.total ?? info?.numPages;
    if (pages && pages > LIMITS.MAX_PDF_PAGES) throw new UploadError(`This PDF has ${pages} pages. Resumes longer than ${LIMITS.MAX_PDF_PAGES} pages aren't supported.`, "pdf_too_long");
    const res = await parser.getText();
    return res.text || "";
  } catch (e) {
    if (e instanceof UploadError) throw e;
    if (/password|encrypt/i.test(e.message)) throw new UploadError("This PDF is password-protected. Remove the password and upload it again.", "pdf_encrypted");
    throw new UploadError(MSG.PARSE_FAILED, "parse_failed", 422);
  } finally {
    await parser.destroy?.().catch(() => {});
  }
}

async function extractDocx(buf) {
  inspectZip(buf);
  const mammoth = require("mammoth");
  try {
    // HTML keeps list structure, so bullets survive (raw text drops them).
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    return stripHtml(value.replace(/<\/td>/gi, " | ").replace(/<\/tr>/gi, "</p>"));
  } catch {
    throw new UploadError(MSG.PARSE_FAILED, "parse_failed", 422);
  }
}

/**
 * @param {Buffer} buffer
 * @param {{fileName?: string}} meta
 * @returns {Promise<{text:string, format:"pdf"|"docx"}>}
 */
async function extractResumeText(buffer, { fileName = "" } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new UploadError("The uploaded file is empty.", "empty_file");
  if (buffer.length > LIMITS.MAX_UPLOAD_BYTES) throw new UploadError(`File is too large. The limit is ${Math.round(LIMITS.MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`, "file_too_large", 413);

  const e = ext(fileName);
  const isPdfMagic = buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"));
  const isZipMagic = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;

  let format;
  if (e === "pdf") {
    if (!isPdfMagic) throw new UploadError("This file is not a valid PDF.", "invalid_file");
    format = "pdf";
  } else if (e === "docx") {
    if (!isZipMagic) throw new UploadError("This file is not a valid DOCX document.", "invalid_file");
    format = "docx";
  } else if (e === "doc") {
    throw new UploadError("Old .doc files aren't supported. Save it as PDF or DOCX and upload again.", "unsupported_type", 415);
  } else {
    throw new UploadError("Only PDF and DOCX resumes are supported.", "unsupported_type", 415);
  }

  const raw = format === "pdf" ? await extractPdf(buffer) : await extractDocx(buffer);
  const text = baseClean(raw);
  if (text.length < LIMITS.MIN_RESUME_CHARS) {
    throw new UploadError(`${MSG.PARSE_FAILED} If your resume is a scanned image, upload a text-based PDF or paste the text instead.`, "parse_failed", 422);
  }
  return { text: text.slice(0, LIMITS.MAX_RESUME_CHARS), format };
}

module.exports = { extractResumeText, inspectZip, UploadError };
