// Runs the BullMQ workers as a separate process from the API server
// (`npm run worker`), so a Playwright crash or a slow scrape never takes
// the REST API down with it.
require("dotenv").config();

require("./workers/ingestWorker");
require("./workers/matchWorker");
require("./workers/applyWorker");
require("./workers/analyticsWorker");

console.log("Workers started: ingest, match, apply, analytics");
