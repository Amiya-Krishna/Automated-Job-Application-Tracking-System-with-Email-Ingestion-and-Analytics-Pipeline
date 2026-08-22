// ingestionService.ingestJob() looks up job_sources by name and throws
// "Unknown job source" if the row doesn't exist yet. Previously only
// whatever rows someone had manually inserted existed, which meant a
// fresh database had NO sources and every ingest (manual, extension,
// scrape) failed until someone remembered to seed this table by hand.
// Run this once at boot (server.js and worker.js) so it's never missing.

const prisma = require("../lib/prisma");

const REQUIRED_SOURCES = [
  { name: "manual", base_url: null },
  { name: "linkedin", base_url: "https://www.linkedin.com" },
  { name: "indeed", base_url: "https://www.indeed.com" },
  { name: "gmail", base_url: null },
  { name: "extension", base_url: null },
];

async function seedJobSources() {
  for (const source of REQUIRED_SOURCES) {
    await prisma.job_sources.upsert({
      where: { name: source.name },
      update: {},
      create: source,
    });
  }
}

module.exports = { seedJobSources, REQUIRED_SOURCES };
