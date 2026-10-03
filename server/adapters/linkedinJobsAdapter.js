const { scrapeLinkedIn } = require("../services/scraper");
const { createJobBoardAdapter } = require("./createJobBoardAdapter");

module.exports = createJobBoardAdapter({ name: "linkedin", label: "LinkedIn", scrape: scrapeLinkedIn });
