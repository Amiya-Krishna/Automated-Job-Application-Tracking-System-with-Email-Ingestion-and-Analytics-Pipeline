const greenhouse = require("./greenhouseAdapter");
const generic = require("./genericAdapter");

// Add more adapters here as you build them (lever, workday, linkedinEasyApply...)
const KNOWN_ADAPTERS = [greenhouse];

function selectAdapter(url) {
  const match = KNOWN_ADAPTERS.find((a) => a.matches(url));
  return match || generic;
}

module.exports = { selectAdapter, KNOWN_ADAPTERS, generic };
