// Runs the BullMQ workers as a separate process from the API server
// (`npm run worker`), so a Playwright crash or a slow scrape never takes
// the REST API down with it.
require("dotenv").config();

const { seedJobSources } = require("./services/seedSources");
seedJobSources()
  .then(() => console.log("job_sources seeded"))
  .catch((err) => console.error("job_sources seed failed:", err.message));

require("./workers/ingestWorker");
require("./workers/matchWorker");
require("./workers/applyWorker");
require("./workers/analyticsWorker");
require("./workers/scrapeWorker");

console.log("Workers started: ingest, match, apply, analytics, scrape");
