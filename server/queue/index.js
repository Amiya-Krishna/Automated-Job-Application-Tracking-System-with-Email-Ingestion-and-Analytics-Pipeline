const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis(
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
  { maxRetriesPerRequest: null },
);

const ingestQueue = new Queue("ingest", { connection });
const dedupQueue = new Queue("dedup", { connection });
const matchQueue = new Queue("match", { connection });
const applyQueue = new Queue("apply", { connection });
const analyticsQueue = new Queue("analytics", { connection });
const scrapeQueue = new Queue("scrape", { connection });

module.exports = {
  connection,
  ingestQueue,
  dedupQueue,
  matchQueue,
  applyQueue,
  analyticsQueue,
  scrapeQueue,
};
