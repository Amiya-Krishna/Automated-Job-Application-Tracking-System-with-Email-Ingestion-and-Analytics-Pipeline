// ingestionService.ingestJob() looks up job_sources by name and throws
// "Unknown job source" if the row doesn't exist yet. Previously only
// whatever rows someone had manually inserted existed, which meant a
// fresh database had NO sources and every ingest (manual, extension,
// scrape) failed until someone remembered to seed this table by hand.
// Run this once at boot (server.js and worker.js) so it's never missing.

const prisma = require("../lib/prisma");

// scope: "private" sources (manual / gmail / extension) hold per-user jobs; "global" sources are
// fetched by an admin and visible to everyone. See services/visibility.js.
const REQUIRED_SOURCES = [
  { name: "manual", base_url: null, scope: "private" },
  { name: "linkedin", base_url: "https://www.linkedin.com", scope: "global" },
  { name: "indeed", base_url: "https://www.indeed.com", scope: "global" },
  { name: "remotive", base_url: "https://remotive.com", scope: "global" },
  { name: "naukri", base_url: "https://www.naukri.com", scope: "global" },
  { name: "internshala", base_url: "https://internshala.com", scope: "global" },
  { name: "wellfound", base_url: "https://wellfound.com", scope: "global" },
  { name: "unstop", base_url: "https://unstop.com", scope: "global" },
  { name: "gmail", base_url: null, scope: "private" },
  { name: "extension", base_url: null, scope: "private" },
];

async function seedJobSources() {
  for (const source of REQUIRED_SOURCES) {
    await prisma.job_sources.upsert({
      where: { name: source.name },
      update: { scope: source.scope },
      create: source,
    });
  }
}

module.exports = { seedJobSources, REQUIRED_SOURCES };
