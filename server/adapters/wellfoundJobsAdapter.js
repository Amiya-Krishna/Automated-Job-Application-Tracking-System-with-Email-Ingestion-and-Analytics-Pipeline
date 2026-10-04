const { makeScraper } = require("../services/jobBoards/scrapePlatform");
const { createJobBoardAdapter } = require("./createJobBoardAdapter");

module.exports = createJobBoardAdapter({ name: "wellfound", label: "Wellfound", scrape: makeScraper("wellfound") });
