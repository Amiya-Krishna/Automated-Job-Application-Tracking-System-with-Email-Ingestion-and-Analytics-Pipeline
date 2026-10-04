// Renders a ResumeProfile to plain text / Markdown / HTML / DOCX / PDF.
// Layout is deliberately a simple single column with standard headings and
// real bullets: that is what ATS parsers read best. Rendering only ever
// prints what is in the profile; it has no way to add content.

const EXPORT_FORMATS = {
  txt: { mime: "text/plain; charset=utf-8", ext: "txt" },
  md: { mime: "text/markdown; charset=utf-8", ext: "md" },
  html: { mime: "text/html; charset=utf-8", ext: "html" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
  pdf: { mime: "application/pdf", ext: "pdf" },
};

/** Profile -> ordered list of typed blocks; every exporter walks this. */
function toBlocks(p) {
  const B = [];
  const push = (type, text) => { if (text && String(text).trim()) B.push({ type, text: String(text).trim() }); };
  const info = p.personalInfo || {};
  push("name", info.name);
  const contact = (info.contactItems || []).map((c) => c.text).join(" | ");
  push("contact", contact);
  for (const l of info.otherLines || []) push("contact", l);

  for (const key of p.sectionOrder) {
    if (key === "summary" && p.summary) { push("heading", p.sectionTitles.summary); push("text", p.summary.text); }
    else if (key === "education") {
      push("heading", p.sectionTitles.education);
      p.education.forEach((e, i) => e.lines.forEach((l, li) => push(li === 0 ? "entryHeader" : "line", l.text)) || (i < p.education.length - 1 && B.push({ type: "gap", text: "" })));
    } else if (key === "experience" || key === "projects") {
      push("heading", p.sectionTitles[key]);
      for (const e of p[key]) {
        e.headerLines.forEach((h, i) => push(i === 0 ? "entryHeader" : "line", h.text));
        if (e.tech) push("line", e.tech.text);
        e.bullets.forEach((b) => push("bullet", b.text));
      }
    } else if (key === "skills") {
      push("heading", p.sectionTitles.skills);
      for (const g of p.skills) push("line", `${g.category ? `${g.category}: ` : ""}${g.items.map((i) => i.text).join(", ")}`);
    } else if (key === "certifications" || key === "achievements") {
      push("heading", p.sectionTitles[key]);
      for (const c of p[key]) push("bullet", c.text);
    } else {
      const ex = p.extraSections.find((s) => s.id === key);
      if (ex) { push("heading", ex.title); ex.lines.forEach((l) => push("line", l.text)); }
    }
  }
  return B;
}

function toText(p) {
  return toBlocks(p).map((b) => {
    switch (b.type) {
      case "name": return `${b.text}`;
      case "heading": return `\n${b.text.toUpperCase()}`;
      case "bullet": return `• ${b.text}`;
      case "gap": return "";
      default: return b.text;
    }
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function toMarkdown(p) {
  return toBlocks(p).map((b) => {
    switch (b.type) {
      case "name": return `# ${b.text}`;
      case "heading": return `\n## ${b.text}`;
      case "entryHeader": return `\n**${b.text}**`;
      case "bullet": return `- ${b.text}`;
      case "gap": return "";
      default: return b.text;
    }
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toHtml(p, { title } = {}) {
  const blocks = toBlocks(p);
  let html = "";
  let inList = false;
  const closeList = () => { if (inList) { html += "</ul>\n"; inList = false; } };
  for (const b of blocks) {
    if (b.type !== "bullet") closeList();
    if (b.type === "name") html += `<h1>${esc(b.text)}</h1>\n`;
    else if (b.type === "contact") html += `<p class="contact">${esc(b.text)}</p>\n`;
    else if (b.type === "heading") html += `<h2>${esc(b.text)}</h2>\n`;
    else if (b.type === "entryHeader") html += `<p class="entry"><strong>${esc(b.text)}</strong></p>\n`;
    else if (b.type === "bullet") { if (!inList) { html += "<ul>\n"; inList = true; } html += `<li>${esc(b.text)}</li>\n`; }
    else if (b.type === "gap") html += "";
    else html += `<p>${esc(b.text)}</p>\n`;
  }
  closeList();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title || p.personalInfo?.name || "Resume")}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.35;color:#111;max-width:780px;margin:24px auto;padding:0 16px}
h1{font-size:20pt;margin:0 0 4px}h2{font-size:12pt;border-bottom:1px solid #999;margin:16px 0 6px;padding-bottom:2px;text-transform:uppercase}
p{margin:2px 0}.contact{color:#333}.entry{margin-top:8px}ul{margin:2px 0 6px 20px;padding:0}li{margin:1px 0}
@media print{body{margin:0;max-width:none}}
</style></head><body>
${html}</body></html>
`;
}

async function toDocx(p) {
  const docx = require("docx");
  const { Document, Packer, Paragraph, TextRun } = docx;
  const kids = toBlocks(p).map((b) => {
    switch (b.type) {
      case "name": return new Paragraph({ children: [new TextRun({ text: b.text, bold: true, size: 36 })] });
      case "heading": return new Paragraph({ spacing: { before: 240, after: 60 }, children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: 24 })] });
      case "entryHeader": return new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: b.text, bold: true })] });
      case "bullet": return new Paragraph({ text: b.text, bullet: { level: 0 } });
      case "gap": return new Paragraph({ text: "" });
      default: return new Paragraph({ children: [new TextRun(b.text)] });
    }
  });
  const doc = new Document({ sections: [{ properties: {}, children: kids }] });
  return Packer.toBuffer(doc);
}

// ---- PDF -------------------------------------------------------------------
// Single-column, ATS-friendly layout using the built-in Helvetica family (real,
// selectable text; no images, tables or text boxes). Hierarchy: name > section
// heading (ruled) > entry header (bold, dates right-aligned) > sub-line (italic) >
// bullets (hanging indent). Headings and entry headers never strand at the bottom of
// a page. The renderer receives only the parsed profile, so layout can never add,
// omit or rewrite resume facts.
const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const DATE_TAIL = new RegExp(
  `^(.*?)[\\s|,\\u2013\\u2014-]*((?:${MONTH}\\s+)?\\d{4}\\s*(?:[\\u2013\\u2014-]|to)\\s*(?:Present|Current|Now|Ongoing|(?:${MONTH}\\s+)?\\d{4})|${MONTH}\\s+\\d{4}|(?:Expected\\s+)?(?:${MONTH}\\s+)?20\\d{2})\\s*$`,
  "i",
);

/** "Acme Corp, Pune   Jan 2021 – Present" -> { left, date }; no trailing date -> { left: text }. */
function splitTrailingDate(text) {
  const m = String(text).match(DATE_TAIL);
  if (m && m[1].trim().length >= 2) {
    const left = m[1].trimEnd();
    // `tail` is everything after the left part, separator included, so the printed line
    // reads exactly like the source text ("... | Jun 2025 - Aug 2025"): lossless re-parse.
    return { left, date: m[2].trim(), tail: String(text).slice(left.length) };
  }
  return { left: String(text) };
}

function toPdf(p) {
  const PDFDocument = require("pdfkit");
  return new Promise((resolve, reject) => {
    const M = { top: 44, bottom: 44, left: 50, right: 50 };
    const doc = new PDFDocument({ size: "A4", margins: M, bufferPages: false, info: { Title: p.personalInfo?.name || "Resume", Author: p.personalInfo?.name || "TrackTrail", Creator: "TrackTrail" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Built-in fonts are WinAnsi (Windows-1252). Characters outside it are transliterated
    // (₹ -> "Rs.", arrows, minus signs, zero-width marks, accented Latin letters) and only
    // truly unrepresentable ones become "?", so the file stays valid and readable.
    const WINANSI = /[\u0009 -~\u00a0-\u00ff–—‘’‚“”„†‡•…‰‹›€™]/;
    const MAP = { "\u20b9": "Rs. ", "\u2192": "->", "\u2190": "<-", "\u2194": "<->", "\u2212": "-", "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2265": ">=", "\u2264": "<=", "\u2248": "~", "\u25cf": "\u2022", "\u25aa": "\u2022", "\u25e6": "\u2022", "\u25a0": "\u2022", "\u25b6": ">", "\u2605": "*", "\u2713": "v", "\u2714": "v", "\u200b": "", "\u200c": "", "\u200d": "", "\ufeff": "", " ": " ", " ": " ", "\u0142": "l", "\u0141": "L", "\u0111": "d", "\u0110": "D", "\u0131": "i" };
    const safe = (s) => Array.from(String(s)).map((ch) => {
      if (WINANSI.test(ch)) return ch;
      if (MAP[ch] !== undefined) return MAP[ch];
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return base && WINANSI.test(base) ? base : "?";
    }).join("");
    const W = doc.page.width - M.left - M.right;
    const bottom = () => doc.page.height - M.bottom;
    const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
    const INK = "#111827", MUTED = "#4B5563", ACCENT = "#1F3A5F";
    const font = (f, size, color) => doc.font(f).fontSize(size).fillColor(color);
    const textH = (t, width, opts = {}) => doc.heightOfString(safe(t), { width, ...opts });

    const blocks = toBlocks(p);
    // style of the "line" blocks that follow an entry header (role/location/tech lines)
    let afterEntry = false;

    blocks.forEach((b, i) => {
      const next = blocks[i + 1];
      switch (b.type) {
        case "name":
          font("Helvetica-Bold", 22, INK);
          doc.text(safe(b.text), M.left, doc.y, { width: W, align: "center", lineGap: 0 });
          doc.moveDown(0.2);
          break;
        case "contact":
          font("Helvetica", 9, MUTED);
          doc.text(safe(b.text), M.left, doc.y, { width: W, align: "center", lineGap: 1.5 });
          break;
        case "heading": {
          afterEntry = false;
          doc.moveDown(0.9);
          font("Helvetica-Bold", 10.5, ACCENT);
          // keep the heading with at least its first entry (header + one bullet)
          ensure(14 + 6 + 34);
          doc.text(safe(b.text.toUpperCase()), M.left, doc.y, { width: W, characterSpacing: 0.8, lineGap: 0 });
          const y = doc.y + 2.5;
          doc.moveTo(M.left, y).lineTo(M.left + W, y).lineWidth(0.8).strokeColor(ACCENT).stroke();
          doc.y = y + 5;
          break;
        }
        case "entryHeader": {
          afterEntry = true;
          doc.moveDown(0.35);
          const { left, tail } = splitTrailingDate(b.text);
          font("Helvetica-Bold", 10.2, INK);
          const h = Math.max(textH(b.text, W), 12);
          ensure(h + 14 + (next ? 12 : 0)); // header never stranded from what follows
          if (tail) {
            doc.text(safe(left), M.left, doc.y, { width: W, continued: true, lineGap: 0.5 });
            font("Helvetica", 9.7, MUTED);
            doc.text(safe(tail), { width: W, lineGap: 0.5 });
          } else {
            doc.text(safe(left), M.left, doc.y, { width: W, lineGap: 0.5 });
          }
          break;
        }
        case "bullet": {
          const indent = 14;
          font("Helvetica", 9.7, INK);
          const h = textH(b.text, W - indent, { lineGap: 1.6 });
          ensure(h + 2);
          const y = doc.y;
          doc.text("•", M.left + 4, y, { width: indent - 4, lineGap: 1.6 });
          doc.text(safe(b.text), M.left + indent, y, { width: W - indent, lineGap: 1.6 });
          doc.y = Math.max(doc.y, y + h) + 1.4;
          break;
        }
        case "gap":
          doc.moveDown(0.25);
          break;
        default: {
          // sub-lines under an entry header are italic; "Category: a, b" skills lines get a bold label
          const m = !afterEntry && b.text.match(/^([^:]{2,30}):\s+(.+)$/);
          if (m) {
            font("Helvetica", 9.7, INK);
            const h = textH(b.text, W, { lineGap: 1.6 });
            ensure(h + 2);
            doc.font("Helvetica-Bold").text(safe(`${m[1]}: `), M.left, doc.y, { continued: true, width: W, lineGap: 1.6 });
            doc.font("Helvetica").text(safe(m[2]), { width: W, lineGap: 1.6 });
            doc.moveDown(0.1);
          } else {
            font(afterEntry ? "Helvetica-Oblique" : "Helvetica", 9.5, afterEntry ? MUTED : INK);
            const h = textH(b.text, W, { lineGap: 1.4 });
            ensure(h + 2 + (next && next.type === "bullet" ? 12 : 0));
            doc.text(safe(b.text), M.left, doc.y, { width: W, lineGap: 1.4 });
            doc.moveDown(0.08);
          }
        }
      }
    });
    doc.end();
  });
}

async function exportProfile(profile, format, opts = {}) {
  const f = EXPORT_FORMATS[format];
  if (!f) throw Object.assign(new Error(`Unsupported export format: ${format}`), { status: 400 });
  let body;
  if (format === "txt") body = Buffer.from(toText(profile), "utf8");
  else if (format === "md") body = Buffer.from(toMarkdown(profile), "utf8");
  else if (format === "html") body = Buffer.from(toHtml(profile, opts), "utf8");
  else if (format === "docx") body = await toDocx(profile);
  else body = await toPdf(profile);
  return { buffer: body, mime: f.mime, ext: f.ext };
}

module.exports = { splitTrailingDate, toBlocks, toText, toMarkdown, toHtml, exportProfile, EXPORT_FORMATS };
