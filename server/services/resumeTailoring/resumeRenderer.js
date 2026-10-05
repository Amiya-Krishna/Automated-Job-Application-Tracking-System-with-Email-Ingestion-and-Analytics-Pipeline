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

// Typographic scale for one render pass. `s` shrinks type and spacing together so a
// resume that only just spills onto a second page can be fitted on one (never below ~0.86).
function pdfMetrics(s) {
  return {
    name: 24 * (0.6 + 0.4 * s), contact: 9.5 * s, heading: 11 * s, entry: 10.8 * s, date: 10 * s, body: 10.4 * s, sub: 10 * s,
    lead: 2.1 * s, secGap: 13 * s, entryGap: 7 * s, bulletGap: 1.8 * s, indent: 14 * s,
  };
}

function renderPdf(p, scale) {
  const PDFDocument = require("pdfkit");
  return new Promise((resolve, reject) => {
    const M = { top: 50, bottom: 46, left: 54, right: 54 };
    const doc = new PDFDocument({ size: "A4", margins: M, bufferPages: false, info: { Title: p.personalInfo?.name ? `${p.personalInfo.name} - Resume` : "Resume", Author: p.personalInfo?.name || "TrackTrail", Creator: "TrackTrail" } });
    const chunks = [];
    let pages = 1;
    doc.on("pageAdded", () => { pages += 1; });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), pages }));
    doc.on("error", reject);

    // Built-in fonts are WinAnsi (Windows-1252). Characters outside it are transliterated
    // (₹ -> "Rs.", arrows, minus signs, zero-width marks, accented Latin letters) and only
    // truly unrepresentable ones become "?", so the file stays valid and readable.
    const WINANSI = /[\u0009 -~ -ÿ–—‘’‚“”„†‡•…‰‹›€™]/;
    const MAP = { "₹": "Rs. ", "→": "->", "←": "<-", "↔": "<->", "−": "-", "‐": "-", "‑": "-", "‒": "-", "≥": ">=", "≤": "<=", "≈": "~", "●": "•", "▪": "•", "◦": "•", "■": "•", "▶": ">", "★": "*", "✓": "v", "✔": "v", "​": "", "‌": "", "‍": "", "﻿": "", " ": " ", " ": " ", "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ı": "i" };
    const safe = (s) => Array.from(String(s)).map((ch) => {
      if (WINANSI.test(ch)) return ch;
      if (MAP[ch] !== undefined) return MAP[ch];
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return base && WINANSI.test(base) ? base : "?";
    }).join("");

    const T = pdfMetrics(scale);
    const W = doc.page.width - M.left - M.right;
    const bottom = () => doc.page.height - M.bottom;
    const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
    const INK = "#111827", MUTED = "#4B5563", ACCENT = "#1F3A5F";
    const font = (f, size, color) => doc.font(f).fontSize(size).fillColor(color);
    const textH = (t, width, opts = {}) => doc.heightOfString(safe(t), { width, ...opts });
    const gap = (pts) => { doc.y += pts; };

    const blocks = toBlocks(p);
    let afterEntry = false; // "line" blocks directly under an entry header are sub-lines (role, tech, GPA)

    blocks.forEach((b, i) => {
      const next = blocks[i + 1];
      switch (b.type) {
        case "name":
          font("Helvetica-Bold", T.name, INK);
          doc.text(safe(b.text), M.left, doc.y, { width: W, align: "center", lineGap: 0 });
          gap(2);
          break;
        case "contact":
          font("Helvetica", T.contact, MUTED);
          doc.text(safe(b.text), M.left, doc.y, { width: W, align: "center", lineGap: 1.5 });
          break;
        case "heading": {
          afterEntry = false;
          gap(T.secGap);
          font("Helvetica-Bold", T.heading, ACCENT);
          // keep the heading together with its first entry (header + one line)
          ensure(T.heading + 8 + T.entry + T.body * 2.4);
          doc.text(safe(b.text.toUpperCase()), M.left, doc.y, { width: W, characterSpacing: 0.9, lineGap: 0 });
          const y = doc.y + 3;
          doc.moveTo(M.left, y).lineTo(M.left + W, y).lineWidth(0.9).strokeColor(ACCENT).stroke();
          doc.y = y + 6;
          break;
        }
        case "entryHeader": {
          afterEntry = true;
          gap(T.entryGap);
          const { left, date, tail } = splitTrailingDate(b.text);
          const minAfter = T.body * 1.6 + (next ? 2 : 0);
          if (date) {
            // role / school left, dates flush right on the same baseline
            font("Helvetica", T.date, MUTED);
            const dateW = doc.widthOfString(safe(date)) + 1;
            const leftW = W - dateW - 14;
            font("Helvetica-Bold", T.entry, INK);
            const h = Math.max(textH(left, leftW, { lineGap: 0.5 }), T.entry);
            ensure(h + minAfter);
            const y = doc.y;
            doc.text(safe(left), M.left, y, { width: leftW, lineGap: 0.5 });
            const endY = doc.y;
            font("Helvetica", T.date, MUTED);
            doc.text(safe(date), M.left + W - dateW, y, { width: dateW + 2, lineBreak: false });
            doc.y = endY;
          } else {
            // "Project | Tech, Stack": name in bold, the rest regular
            const m = b.text.match(/^(.+?)(\s+\|\s+.+)$/);
            font("Helvetica-Bold", T.entry, INK);
            ensure(Math.max(textH(b.text, W), T.entry) + minAfter);
            if (m && !tail) {
              doc.text(safe(m[1]), M.left, doc.y, { width: W, continued: true, lineGap: 0.5 });
              font("Helvetica", T.date, MUTED);
              doc.text(safe(m[2]), { width: W, lineGap: 0.5 });
            } else {
              doc.text(safe(b.text), M.left, doc.y, { width: W, lineGap: 0.5 });
            }
          }
          gap(1);
          break;
        }
        case "bullet": {
          const indent = T.indent;
          font("Helvetica", T.body, INK);
          const h = textH(b.text, W - indent, { lineGap: T.lead });
          ensure(h + 2);
          const y = doc.y;
          doc.text("•", M.left + 3, y, { width: indent - 3, lineGap: T.lead });
          doc.text(safe(b.text), M.left + indent, y, { width: W - indent, lineGap: T.lead });
          doc.y = Math.max(doc.y, y + h) + T.bulletGap;
          break;
        }
        case "gap":
          gap(T.entryGap * 0.4);
          break;
        default: {
          // "Category: a, b" skills lines get a bold label; sub-lines under an entry are muted italic
          const m = !afterEntry && b.text.match(/^([^:]{2,30}):\s+(.+)$/);
          if (m) {
            font("Helvetica", T.body, INK);
            const h = textH(b.text, W, { lineGap: T.lead });
            ensure(h + 2);
            doc.font("Helvetica-Bold").text(safe(`${m[1]}: `), M.left, doc.y, { continued: true, width: W, lineGap: T.lead });
            doc.font("Helvetica").text(safe(m[2]), { width: W, lineGap: T.lead });
            gap(T.bulletGap);
          } else {
            font(afterEntry ? "Helvetica-Oblique" : "Helvetica", afterEntry ? T.sub : T.body, afterEntry ? MUTED : INK);
            const h = textH(b.text, W, { lineGap: T.lead });
            ensure(h + 2 + (next && next.type === "bullet" ? T.body * 1.4 : 0));
            doc.text(safe(b.text), M.left, doc.y, { width: W, lineGap: T.lead });
            gap(T.bulletGap);
          }
        }
      }
    });
    doc.end();
  });
}

// Renders at full size first; if that only just spills onto a second page it retries slightly
// smaller (down to 0.86) so a one-page resume stays one page. Genuinely long resumes keep the
// readable full size and flow onto more pages.
async function toPdf(p) {
  const first = await renderPdf(p, 1);
  if (first.pages === 1) return first.buffer;
  for (const s of [0.95, 0.91, 0.87]) {
    const r = await renderPdf(p, s);
    if (r.pages === 1) return r.buffer;
  }
  return first.buffer;
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
