const { makeScraper } = require("../services/jobBoards/scrapePlatform");
const { createJobBoardAdapter } = require("./createJobBoardAdapter");

module.exports = createJobBoardAdapter({ name: "naukri", label: "Naukri", scrape: makeScraper("naukri") });
