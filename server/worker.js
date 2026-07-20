// Runs the BullMQ workers as a separate process from the API server
// (`npm run worker`), so a Playwright crash or a slow scrape never takes
// the REST API down with it.
require("dotenv").config();

require("./workers/matchWorker");
require("./workers/applyWorker");
require("./workers/analyticsWorker");

// Note: dedup runs inline inside services/ingestionService.js rather than as
// its own queue — the fuzzy-match check is already scoped to one company +
// a 14-day window, so it's cheap enough to do synchronously before insert.
// Split it into its own worker later if ingestion volume makes it a bottleneck.

console.log("Workers started: match, apply, analytics");
