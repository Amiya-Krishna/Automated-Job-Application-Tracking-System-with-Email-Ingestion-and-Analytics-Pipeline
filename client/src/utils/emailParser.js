// Lightweight, dependency-free heuristics for pulling job-application
// details out of a pasted email (interview invite, rejection, offer, etc).
// This is intentionally "best effort" — regex + keyword scoring, not real
// NLP — so every field it fills in is still editable before saving.

const STATUS_KEYWORDS = [
  {
    status: "Offer",
    patterns: [
      /pleased to (offer|extend)/i,
      /job offer/i,
      /offer letter/i,
      /extend(ing)? (you )?an offer/i,
      /welcome to the team/i,
    ],
  },
  {
    status: "Rejected",
    patterns: [
      /unfortunately/i,
      /regret to inform/i,
      /not (be )?moving forward/i,
      /decided to (move forward with|proceed with) other/i,
      /not (been )?selected/i,
      /other candidates? whose (experience|background)/i,
    ],
  },
  {
    status: "Interview",
    patterns: [
      /interview/i,
      /schedule a (call|chat|conversation)/i,
      /phone screen/i,
      /next step/i,
      /available (for a call|to talk|to speak)/i,
    ],
  },
];

function detectStatus(text) {
  for (const group of STATUS_KEYWORDS) {
    if (group.patterns.some((pattern) => pattern.test(text))) {
      return group.status;
    }
  }
  return "Applied";
}

function detectCompany(text) {
  // "at Acme Corp", "with Acme Corp"
  const atMatch = text.match(
    /\b(?:at|with)\s+([A-Z][A-Za-z0-9&.,'\- ]{1,40}?)(?:[.,!\n]| team| recruiting| talent| for)/
  );
  if (atMatch) return atMatch[1].trim();

  // Signature-style: "Acme Corp Recruiting Team" / "Acme Corp Talent Team"
  const signatureMatch = text.match(
    /([A-Z][A-Za-z0-9&.,'\- ]{1,40}?)\s+(?:Recruiting|Talent|HR|People)\s+Team/
  );
  if (signatureMatch) return signatureMatch[1].trim();

  // "From: Someone <someone@acme.com>" -> Acme
  const emailMatch = text.match(/@([A-Za-z0-9-]+)\.[a-z]{2,}/i);
  if (emailMatch) {
    const domain = emailMatch[1];
    if (!["gmail", "yahoo", "outlook", "hotmail", "icloud"].includes(domain.toLowerCase())) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }

  return "";
}

function detectRole(text) {
  const patterns = [
    /for the\s+([A-Za-z0-9&.,'\-/ ]{2,50}?)\s+(?:position|role)/i,
    /application for\s+([A-Za-z0-9&.,'\-/ ]{2,50}?)(?:[.,!\n]|\s+at\b)/i,
    /the\s+([A-Za-z0-9&.,'\-/ ]{2,50}?)\s+role\b/i,
    /position of\s+([A-Za-z0-9&.,'\-/ ]{2,50}?)(?:[.,!\n]|\s+at\b)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  return "";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function detectDate(text) {
  // "March 5, 2027" or "March 5th, 2027"
  const longMatch = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/
  );
  if (longMatch) {
    const month = MONTHS.indexOf(longMatch[1]) + 1;
    const day = longMatch[2].padStart(2, "0");
    return `${longMatch[3]}-${String(month).padStart(2, "0")}-${day}`;
  }

  // "03/05/2027" or "3/5/2027" (assume MM/DD/YYYY)
  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // ISO-ish "2027-03-05"
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return isoMatch[0];

  return "";
}

export function parseJobEmail(rawText) {
  const text = rawText.trim();

  if (!text) {
    return { company: "", role: "", status: "Applied", interviewDate: "", matched: false };
  }

  const result = {
    company: detectCompany(text),
    role: detectRole(text),
    status: detectStatus(text),
    interviewDate: detectDate(text),
  };

  result.matched = Boolean(result.company || result.role || result.interviewDate);

  return result;
}
