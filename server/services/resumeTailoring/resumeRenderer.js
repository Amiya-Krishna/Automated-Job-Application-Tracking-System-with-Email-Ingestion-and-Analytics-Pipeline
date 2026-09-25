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

function toPdf(p) {
  const PDFDocument = require("pdfkit");
  return new Promise((resolve, reject) => {
    // This is deliberately the one renderer used by both the untouched
    // original and approved tailored exports. It receives only the parsed
    // profile, so layout work can never add, omit or rewrite resume facts.
    const margin = 54;
    const doc = new PDFDocument({ size: "A4", margins: { top: margin, bottom: margin, left: margin, right: margin }, info: { Title: p.personalInfo?.name || "Resume", Author: "TrackTrail" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    // Standard PDF fonts use WinAnsi (Windows-1252): Latin-1 plus common
    // typographic punctuation (— – “ ” ‘ ’ • … € ™). Anything outside that
    // set can't be drawn with a built-in font, so it is replaced with "?"
    // to keep the file valid rather than failing.
    const safe = (s) => s.replace(/[^\u0009\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g, "?");
    const pageBottom = () => doc.page.height - margin;
    const ensureSpace = (height) => { if (doc.y + height > pageBottom()) doc.addPage(); };
    const write = (text, options = {}) => {
      const value = safe(text);
      const height = doc.heightOfString(value, options);
      ensureSpace(height);
      doc.text(value, options);
    };
    const rule = () => {
      ensureSpace(7);
      doc.moveTo(margin, doc.y + 2).lineTo(doc.page.width - margin, doc.y + 2).lineWidth(0.7).strokeColor("#94A3B8").stroke();
      doc.moveDown(0.34);
    };
    for (const b of toBlocks(p)) {
      switch (b.type) {
        case "name":
          doc.font("Helvetica-Bold").fontSize(20).fillColor("#0F172A");
          write(b.text, { align: "center", lineGap: 1 });
          doc.moveDown(0.12);
          break;
        case "contact":
          doc.font("Helvetica").fontSize(9.2).fillColor("#334155");
          write(b.text, { align: "center", lineGap: 1 });
          break;
        case "heading":
          doc.moveDown(0.62);
          doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#0F4C5C");
          ensureSpace(doc.currentLineHeight() + 14);
          write(b.text.toUpperCase(), { characterSpacing: 0.65, lineGap: 1 });
          rule();
          break;
        case "entryHeader":
          doc.moveDown(0.24);
          doc.font("Helvetica-Bold").fontSize(10.1).fillColor("#172033");
          write(b.text, { lineGap: 1 });
          break;
        case "bullet":
          doc.font("Helvetica").fontSize(9.7).fillColor("#243041");
          write(`\u2022  ${b.text}`, { indent: 11, continued: false, lineGap: 2, paragraphGap: 1 });
          break;
        case "gap": doc.moveDown(0.16); break;
        default:
          doc.font("Helvetica").fontSize(9.7).fillColor("#243041");
          write(b.text, { lineGap: 2, paragraphGap: 1 });
      }
    }
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

module.exports = { toBlocks, toText, toMarkdown, toHtml, exportProfile, EXPORT_FORMATS };
