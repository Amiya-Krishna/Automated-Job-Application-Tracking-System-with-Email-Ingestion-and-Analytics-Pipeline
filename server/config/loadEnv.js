const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

/**
 * Environment loading policy:
 * - Production/staging hosts use their platform-injected environment first.
 * - Local development prefers server/.env.local so production URLs in .env
 *   cannot accidentally become the target of a local run.
 * - .env remains the shared fallback for values that are not overridden locally.
 */
function loadEnv() {
  const root = path.resolve(__dirname, "..");
  const isProductionLike = ["production", "staging"].includes(process.env.NODE_ENV);

  if (!isProductionLike) {
    const localPath = path.join(root, ".env.local");
    if (fs.existsSync(localPath)) {
      dotenv.config({ path: localPath, override: true });
    }
  }

  // Load the normal .env only for values not already supplied by the local file.
  dotenv.config({ path: path.join(root, ".env"), override: false });

  return process.env;
}

module.exports = { loadEnv };
