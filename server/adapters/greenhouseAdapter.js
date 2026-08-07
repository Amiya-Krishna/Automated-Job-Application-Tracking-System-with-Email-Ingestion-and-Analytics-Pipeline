// Greenhouse-hosted application forms (boards.greenhouse.io/...) use fairly
// stable field ids. This adapter is intentionally narrow — extend the map
// as you encounter real Greenhouse postings during testing.

const FIELD_MAP = {
  full_name: "#first_name", // note: Greenhouse splits first/last; see README
  email: "#email",
  phone: "#phone",
  resume_upload: "#resume",
  linkedin_url: "input[name*='linkedin']",
};

function matches(url) {
  return url.includes("greenhouse.io") || url.includes("boards.greenhouse.io");
}

async function detectFields(page) {
  const present = {};
  for (const [key, selector] of Object.entries(FIELD_MAP)) {
    if ((await page.$(selector)) !== null) present[key] = selector;
  }
  return present;
}

async function isCaptchaPresent(page) {
  return (await page.$("iframe[src*='recaptcha']")) !== null;
}

module.exports = { name: "greenhouse", matches, detectFields, isCaptchaPresent };
