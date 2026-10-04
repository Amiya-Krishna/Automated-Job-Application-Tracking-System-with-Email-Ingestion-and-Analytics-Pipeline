// Relevance filtering + field extraction for "Scan Inbox".
//
// Goal: only job / internship related mail (application receipts, interview and
// assessment invitations, offers, rejections, recruiter outreach about a specific
// role) reaches the user - never newsletters, promotions, job-alert digests, OTPs,
// social notifications or personal mail.
//
// Two cheap stages run BEFORE anything expensive:
//   1. buildGmailQuery()   - Gmail does the first cut server-side (categories,
//                            subject phrases, known recruiting senders), so most of
//                            the inbox is never listed, let alone fetched.
//   2. classifyEmail()     - scores the metadata we already have (subject, sender,
//                            labels, bulk-mail headers, snippet). No body is fetched.
// Everything here is pure (no I/O) so it is unit-tested directly.

// ---------------------------------------------------------------- vocab
// Applicant tracking systems / recruiting platforms: mail from these domains is
// about a specific application far more often than not.
const ATS_DOMAINS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "myworkday.com", "workday.com",
  "myworkdayjobs.com", "smartrecruiters.com", "icims.com", "ashbyhq.com", "jobvite.com", "taleo.net",
  "successfactors.com", "successfactors.eu", "oraclecloud.com", "bamboohr.com", "breezy.hr", "recruitee.com",
  "workable.com", "teamtailor.com", "pinpointhq.com", "rippling.com", "hirevue.com", "hackerrank.com",
  "hackerearth.com", "codility.com", "codesignal.com", "testgorilla.com", "mettl.com", "amcat.in",
  "eightfold.ai", "phenom.com", "brassring.com", "careers-page.com", "zohorecruit.com", "freshteam.com",
];

// Job boards: only counted together with an application-style subject (their
// marketing / digest mail shares these domains).
const JOB_BOARD_DOMAINS = [
  "linkedin.com", "indeed.com", "naukri.com", "internshala.com", "wellfound.com", "angel.co", "unstop.com",
  "glassdoor.com", "monster.com", "foundit.in", "shine.com", "hirist.tech", "cutshort.io", "instahyre.com",
];

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "live.com", "icloud.com",
  "proton.me", "protonmail.com", "aol.com", "rediffmail.com", "zoho.com",
]);

const GENERIC_SENDER_WORDS = /\b(careers?|recruit(?:ing|ment|er|ers)?|talent(?: acquisition)?|hr|human resources|people(?: team| ops)?|jobs?|hiring|hire|team|notifications?|no-?reply|do-?not-?reply|mailer|alerts?|support|admin|via\s+\S+.*)\b/gi;

// Strong subject phrases -> what kind of mail it is.
const SUBJECT_SIGNALS = [
  { re: /\b(offer letter|job offer|offer of employment|pleased to offer|extend(?:ing)? (?:you )?an offer|your offer\b)/i, kind: "offer", weight: 4 },
  { re: /\b(interview|phone screen|technical screen|screening call|schedule (?:a )?(?:call|chat)|meet the team|onsite|on-site)\b/i, kind: "interview", weight: 4 },
  { re: /\b(online assessment|coding (?:challenge|assessment|test)|take-?home|assessment|aptitude test|hackathon invite|test link|case study)\b/i, kind: "interview", weight: 4 },
  { re: /\b(unfortunately|regret to inform|not (?:be )?moving forward|not been selected|not selected|will not be proceeding|decided to (?:move|proceed) (?:forward )?with other|other candidates|position has been filled|no longer (?:being )?considered)\b/i, kind: "rejection", weight: 4 },
  { re: /\b(application (?:received|submitted|confirmation|status|update|was sent|has been received)|(?:your|my) application|thank(?:s| you) for (?:applying|your application|your interest in)|applied (?:to|for|successfully)|we received your application|application to\b|application for\b)/i, kind: "application", weight: 4 },
  { re: /\b(shortlisted|next steps?|moving forward|congratulations|selected for|candidate(?:ure)? (?:update|status)|recruiter|hiring manager|your candidacy)\b/i, kind: "application", weight: 3 },
  { re: /\b(internship|intern\b|job opportunity|opportunity at|role at|position at|opening at|we(?:'| a)re hiring)\b/i, kind: "recruiter", weight: 2 },
];

// Mail that merely mentions jobs in bulk - never an application.
const DIGEST_RE = /\b(job alerts?|jobs? (?:you may|for you|similar|recommended|picked)|recommended jobs?|new jobs? (?:for|matching|in)|\d+\+? new jobs?|top (?:jobs|companies|picks)|jobs? based on|weekly (?:digest|roundup|jobs)|daily (?:digest|jobs)|newsletter|people also viewed|who(?:'s| has) viewed your profile|profile views?|trending jobs|similar jobs|jobs near you|career tips|interview (?:tips|questions|prep|guide)|webinar|course|discount|% off|sale\b|deal\b|promo|coupon|subscribe|unsubscribe|your weekly|your daily|digest)\b/i;

const NOISE_RE = /\b(otp|one[- ]time (?:password|passcode|code)|verification code|verify your (?:email|account|identity|phone)|confirm your (?:email|account)|password reset|reset your password|security (?:alert|code)|sign[- ]in (?:attempt|code)|login (?:code|alert)|2-?step|two-?factor|your (?:order|invoice|receipt|statement|bill|payment|ride|trip|delivery)|bank|credit card|transaction)\b/i;

const SOCIAL_RE = /\b(invited you to connect|wants to connect|accepted your invitation|endorsed you|congratulate .* on|work anniversary|birthday|mentioned you|commented on|liked your|reacted to|new follower|followed you|joined (?:linkedin|your network)|added you)\b/i;

const BODY_HINT_RE = /\b(your application|applying|applied|candidate|interview|recruiter|hiring team|assessment|job offer|position|role)\b/i;

// ---------------------------------------------------------------- helpers
function parseFrom(header) {
  const raw = String(header || "").trim();
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const name = (m ? m[1] : "").trim();
  const email = (m ? m[2] : raw).trim().toLowerCase();
  const at = email.lastIndexOf("@");
  return { name, email, local: at > 0 ? email.slice(0, at) : email, domain: at > 0 ? email.slice(at + 1) : "" };
}

const domainMatches = (domain, list) => list.some((d) => domain === d || domain.endsWith(`.${d}`));

function titleCase(str) {
  return String(str).split(/[\s._-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function cleanCompany(raw) {
  let c = String(raw || "").replace(/["'<>]/g, " ").replace(GENERIC_SENDER_WORDS, " ").replace(/[|:·•-]+\s*$/g, "").replace(/\s+/g, " ").trim();
  c = c.replace(/^(?:the|at|to|with)\s+/i, "").replace(/[.,;:!?]+$/g, "").trim();
  return c.length >= 2 && c.length <= 80 ? c : "";
}

// ---------------------------------------------------------------- extraction
function extractCompany({ subject, snippet, from }) {
  const s = String(subject || "");
  const body = String(snippet || "");
  const patterns = [
    // "... Software Engineer Intern at Acme" - the LAST " at <Capitalised name>" wins
    /\b(?:application|applied|applying|interview|assessment|offer|role|position|opening|internship|job|opportunity)\b.*\bat\s+([A-Z][^.!,|:()]{1,60}?)(?:[.!,|:)]|\s+-\s|$)/,
    /\b(?:application|applied|applying)\s+(?:was sent\s+)?to\s+(.+?)(?:\s+(?:for|-|\||:)|[.!,]|$)/i,        // "Your application was sent to Acme"
    /\bthank(?:s| you) for (?:applying|your (?:application|interest))(?: to| at| with| in)\s+(.+?)(?:[.!,|:]|\s+-\s|$)/i,
    /\b(?:your )?application (?:to|at|with)\s+(.+?)(?:[.!,|:]|\s+-\s|$)/i,
    /\b(?:role|position|opening|opportunity|internship|job) at\s+(.+?)(?:[.!,|:)]|\s+-\s|\s+is\b|$)/i,
    /\b(?:interview|offer|assessment) (?:with|from|at)\s+(.+?)(?:[.!,|:]|\s+-\s|\s+for\b|$)/i,
    /^(.+?)\s+[-|:–]\s+(?:your )?(?:application|interview|assessment|offer)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re) || body.match(re);
    const c = m && cleanCompany(m[1]);
    if (c && !/^(?:your|our|the|this|a|an)$/i.test(c)) return c;
  }
  const f = parseFrom(from);
  // Sender display name unless it is only a platform / generic mailbox.
  const display = cleanCompany(f.name.replace(/\s+(?:via|from)\s+.+$/i, ""));
  const platformWords = /^(linkedin|indeed|naukri|internshala|wellfound|unstop|glassdoor|greenhouse|lever|workday|smartrecruiters|icims|ashby|jobvite|hackerrank|hackerearth|codility|google|microsoft)$/i;
  if (display && !platformWords.test(display)) return display;
  if (f.domain && !FREE_MAIL_DOMAINS.has(f.domain) && !domainMatches(f.domain, ATS_DOMAINS) && !domainMatches(f.domain, JOB_BOARD_DOMAINS)) {
    const root = f.domain.replace(/^(?:mail|email|careers?|jobs|hr|talent|notifications?|no-?reply|mg|em|e|t|hello|recruiting)\./i, "").split(".")[0];
    return root ? titleCase(root) : "";
  }
  return "";
}

function extractRole({ subject, snippet }) {
  const text = `${subject || ""}\n${snippet || ""}`;
  const patterns = [
    /\b(?:for|as)\s+(?:the|an?)\s+(.{3,70}?)\s+(?:position|role|internship|opening|opportunity|job)\b/i,
    /\bapplication (?:for|to)\s+(?:the\s+)?(?:position of\s+)?(.{3,70}?)(?:\s+(?:at|with|@|-|\|)\s|[.!,:|]|$)/i,
    /\b(?:applied|applying) (?:for|to)\s+(?:the\s+)?(.{3,70}?)(?:\s+(?:at|with|@|-|\|)\s|[.!,:|]|$)/i,
    /\b(?:interview|assessment) for\s+(?:the\s+)?(.{3,70}?)(?:\s+(?:at|with|@|-|\|)\s|[.!,:|]|$)/i,
    /\bposition of\s+(.{3,70}?)(?:\s+(?:at|with|@)\s|[.!,:|]|$)/i,
    /\bthe\s+(.{3,60}?)\s+(?:role|position)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const r = m[1].replace(/["“”]/g, "").replace(/\s+(?:was|has been|is|were)\b.*$/i, "").replace(/\s+/g, " ").trim();
      if (r && !/^(?:your|our|this|the|a|an|job|position|role)$/i.test(r) && r.length <= 70) return r;
    }
  }
  return "";
}

const OFFER_RE = /\b(job offer|offer letter|offer of employment|pleased to offer|extend(?:ing)? (?:you )?an offer)\b/i;
const REJECT_RE = /\b(unfortunately|regret to inform|not (?:be )?moving forward|not been selected|not selected|will not be proceeding|decided to (?:move|proceed) (?:forward )?with other|position has been filled|no longer (?:being )?considered)\b/i;
const RECEIPT_RE = /\b(application (?:received|submitted|confirmation|was sent|has been received)|thank(?:s| you) for (?:applying|your application)|we received your application|applied (?:to|for|successfully))\b/i;
const INTERVIEW_BODY_RE = /\b(schedule (?:an? )?(?:interview|call)|invite you (?:to|for) (?:an? )?(?:interview|assessment)|interview (?:is )?(?:scheduled|confirmed)|online assessment|coding (?:challenge|test))\b/i;

function detectStatus(kind, subject, snippet) {
  const t = `${subject} ${snippet}`;
  if (kind === "offer" || OFFER_RE.test(t)) return "Offer";
  if (kind === "rejection" || REJECT_RE.test(t)) return "Rejected";
  if (kind === "interview") return "Interview";
  // an application receipt often says "we'll contact you for an interview if shortlisted"
  if (!RECEIPT_RE.test(subject) && INTERVIEW_BODY_RE.test(t)) return "Interview";
  return "Applied";
}

/**
 * The address a person would actually reply to: Reply-To, then From - but never a
 * no-reply / ATS system mailbox.
 */
function extractContactEmail(headers = {}, from) {
  const candidates = [headers["reply-to"], from].filter(Boolean).map((h) => parseFrom(h));
  for (const c of candidates) {
    if (!c.email || !c.domain) continue;
    if (/^(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|notifications?|alerts?|bounce)/i.test(c.local)) continue;
    if (domainMatches(c.domain, ATS_DOMAINS) || domainMatches(c.domain, JOB_BOARD_DOMAINS)) continue;
    return c.email;
  }
  return "";
}

// ---------------------------------------------------------------- classification
/**
 * @param {{subject:string, from:string, snippet?:string, labelIds?:string[], headers?:Object}} msg
 *        headers: lower-cased header name -> value (list-unsubscribe, precedence, reply-to, ...)
 * @returns {{relevant:boolean, score:number, kind:string|null, reasons:string[], reject?:string,
 *            company:string, role:string, status:string, contactEmail:string, senderEmail:string}}
 */
function classifyEmail(msg) {
  const subject = String(msg.subject || "");
  const snippet = String(msg.snippet || "");
  const labels = new Set(msg.labelIds || []);
  const headers = msg.headers || {};
  const sender = parseFrom(msg.from);
  const reasons = [];
  const out = (extra) => ({
    relevant: false, score: 0, kind: null, reasons, company: "", role: "", status: "Applied",
    contactEmail: "", senderEmail: sender.email, ...extra,
  });

  // Hard rejections first - cheapest and most certain.
  if (labels.has("SPAM") || labels.has("TRASH")) return out({ reject: "spam" });
  if (NOISE_RE.test(subject)) return out({ reject: "transactional" });
  if (SOCIAL_RE.test(subject) || labels.has("CATEGORY_SOCIAL")) return out({ reject: "social" });

  const isAts = domainMatches(sender.domain, ATS_DOMAINS);
  const isBoard = domainMatches(sender.domain, JOB_BOARD_DOMAINS);

  // Subject signals: keep the strongest one.
  let best = null;
  for (const sig of SUBJECT_SIGNALS) {
    if (sig.re.test(subject) && (!best || sig.weight > best.weight)) best = sig;
  }
  if (!best) {
    // Some ATS mail has an unremarkable subject but a clear body snippet.
    for (const sig of SUBJECT_SIGNALS) {
      if (sig.weight >= 4 && sig.re.test(snippet) && isAts) { best = { ...sig, weight: 3 }; break; }
    }
  }

  const bulk = Boolean(headers["list-unsubscribe"]) || /bulk|list|junk/i.test(headers.precedence || "");
  const digest = DIGEST_RE.test(subject);
  const promo = labels.has("CATEGORY_PROMOTIONS") || labels.has("CATEGORY_FORUMS");

  // Digests / promotions are rejected unless an ATS (not a board) sent a clear application mail.
  if (digest && !(isAts && best && best.weight >= 4)) return out({ reject: "digest_or_promo" });
  if (promo && !(isAts && best && best.weight >= 4)) return out({ reject: "promotions" });

  let score = 0;
  if (best) { score += best.weight; reasons.push(`subject:${best.kind}`); }
  if (isAts) { score += 2; reasons.push("sender:ats"); }
  if (isBoard && best && best.weight >= 4) { score += 1; reasons.push("sender:job-board"); }
  if (/^(?:careers?|jobs?|recruit(?:ing|ment|er)?|talent|hr|hiring|people|applications?|campus)/i.test(sender.local)) { score += 1; reasons.push("sender:recruiting-mailbox"); }
  if (BODY_HINT_RE.test(snippet)) { score += 1; reasons.push("snippet"); }
  if (bulk && !isAts) { score -= 2; reasons.push("bulk-mail"); }
  if (isBoard && !best) { score -= 1; }

  const company = extractCompany({ subject, snippet, from: msg.from });
  const role = extractRole({ subject, snippet });

  // Relevance threshold: a strong subject alone qualifies; weaker signals need support.
  const relevant = score >= 4 || (score >= 3 && (isAts || Boolean(company && role)));
  if (!relevant) return out({ score, reject: "not_job_related" });

  const kind = best ? best.kind : "application";
  return out({
    relevant: true,
    score,
    kind,
    company,
    role,
    status: detectStatus(kind, subject, snippet),
    contactEmail: extractContactEmail(headers, msg.from),
  });
}

// ---------------------------------------------------------------- Gmail query
const SUBJECT_PHRASES = [
  '"your application"', '"application received"', '"application submitted"', '"application status"', '"application update"',
  '"thank you for applying"', '"thanks for applying"', '"thank you for your application"', '"applied to"', '"application to"', '"application for"',
  "interview", '"online assessment"', "assessment", '"coding challenge"', '"next steps"', "shortlisted",
  '"job offer"', '"offer letter"', '"pleased to offer"', '"moving forward"', '"not moving forward"', '"not selected"', '"regret to inform"', "unfortunately",
  "internship", "recruiter", '"your candidacy"',
];

function buildGmailQuery({ days = 30 } = {}) {
  const d = Math.min(Math.max(Number(days) || 30, 1), 365);
  const senders = ATS_DOMAINS.concat(["naukri.com", "internshala.com", "unstop.com", "wellfound.com", "linkedin.com", "indeed.com"]);
  return [
    `newer_than:${d}d`,
    "-in:spam", "-in:trash", "-in:drafts", "-in:sent",
    "-category:promotions", "-category:social", "-category:forums",
    `(subject:(${SUBJECT_PHRASES.join(" OR ")}) OR from:(${senders.join(" OR ")}))`,
  ].join(" ");
}

// ---------------------------------------------------------------- batch filtering
/**
 * Applies classifyEmail to a batch and removes duplicates.
 * @param {Array} messages  [{id, threadId, subject, from, date, snippet, labelIds, headers}]
 * @param {{importedIds?:Set<string>}} ctx
 * @returns {{messages:Array, stats:Object}}
 */
function filterJobEmails(messages, ctx = {}) {
  const imported = ctx.importedIds || new Set();
  const stats = { scanned: messages.length, relevant: 0, skipped: { notJobRelated: 0, promotional: 0, transactional: 0, social: 0, alreadyImported: 0, duplicate: 0 } };
  const keptByThread = new Map();
  const seenKey = new Set();
  const kept = [];

  for (const m of messages) {
    const c = classifyEmail(m);
    if (!c.relevant) {
      const k = c.reject;
      if (k === "transactional") stats.skipped.transactional += 1;
      else if (k === "social") stats.skipped.social += 1;
      else if (k === "digest_or_promo" || k === "promotions") stats.skipped.promotional += 1;
      else stats.skipped.notJobRelated += 1;
      continue;
    }
    if (imported.has(m.id)) { stats.skipped.alreadyImported += 1; continue; }

    const item = { ...m, classification: { kind: c.kind, score: c.score, reasons: c.reasons }, company: c.company, role: c.role, status: c.status, contactEmail: c.contactEmail, senderEmail: c.senderEmail };
    delete item.headers;
    delete item.labelIds;

    // one entry per conversation: keep the most recent (messages arrive newest-first)
    const tKey = m.threadId || m.id;
    if (keptByThread.has(tKey)) { stats.skipped.duplicate += 1; continue; }
    // identical company+role+status in different threads (e.g. re-sent receipts)
    const sig = c.company && c.role ? `${c.company.toLowerCase()}|${c.role.toLowerCase()}|${c.status}` : null;
    if (sig && seenKey.has(sig)) { stats.skipped.duplicate += 1; continue; }
    keptByThread.set(tKey, true);
    if (sig) seenKey.add(sig);
    kept.push(item);
  }
  stats.relevant = kept.length;
  return { messages: kept, stats };
}

module.exports = {
  ATS_DOMAINS,
  JOB_BOARD_DOMAINS,
  buildGmailQuery,
  classifyEmail,
  filterJobEmails,
  extractCompany,
  extractRole,
  extractContactEmail,
  parseFrom,
};
