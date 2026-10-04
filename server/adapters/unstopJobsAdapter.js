const { makeScraper } = require("../services/jobBoards/scrapePlatform");
const { createJobBoardAdapter } = require("./createJobBoardAdapter");

module.exports = createJobBoardAdapter({ name: "unstop", label: "Unstop", scrape: makeScraper("unstop") });
