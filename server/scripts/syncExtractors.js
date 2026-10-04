// Copies the single-source extractor module from the browser extension into the
// server (the server is deployed on its own, so it cannot require ../browser-extension).
//   npm run sync:extractors          copy
//   npm run sync:extractors -- --check   exit 1 if the copy has drifted
const fs = require("fs");
const path = require("path");
const src = path.resolve(__dirname, "../../browser-extension/platform-extractors.js");
const dst = path.resolve(__dirname, "../services/jobBoards/platformExtractors.js");
if (!fs.existsSync(src)) { console.log("browser-extension not present; nothing to sync"); process.exit(0); }
const a = fs.readFileSync(src, "utf8");
const b = fs.existsSync(dst) ? fs.readFileSync(dst, "utf8") : "";
if (process.argv.includes("--check")) {
  if (a !== b) { console.error("platformExtractors.js is out of date. Run: npm run sync:extractors"); process.exit(1); }
  console.log("platformExtractors.js is in sync");
} else {
  fs.writeFileSync(dst, a);
  console.log("synced platformExtractors.js");
}
