// Fallback adapter used when no known-ATS adapter matches the page.
// Matches <label> text to field types via keyword heuristics, since most
// ATS platforms don't share stable `name`/`id` attributes.

const FIELD_KEYWORDS = {
  full_name: ["full name", "your name", "first name"],
  email: ["email"],
  phone: ["phone", "mobile"],
  resume_upload: ["resume", "cv", "upload"],
  linkedin_url: ["linkedin"],
};

async function detectFields(page) {
  const fieldMap = {};
  const labels = await page.$$eval("label", (els) =>
    els.map((el) => ({
      text: el.innerText.trim().toLowerCase(),
      forId: el.getAttribute("for"),
    }))
  );

  for (const { text, forId } of labels) {
    if (!forId) continue;
    for (const [fieldKey, keywords] of Object.entries(FIELD_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw)) && !fieldMap[fieldKey]) {
        fieldMap[fieldKey] = `#${forId}`;
      }
    }
  }
  return fieldMap;
}

async function isCaptchaPresent(page) {
  const selectors = [
    "iframe[src*='recaptcha']",
    "iframe[src*='hcaptcha']",
    "[class*='captcha']",
  ];
  for (const sel of selectors) {
    if ((await page.$(sel)) !== null) return true;
  }
  return false;
}

module.exports = { name: "generic", detectFields, isCaptchaPresent };
