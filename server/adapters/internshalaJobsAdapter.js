const { makeScraper } = require("../services/jobBoards/scrapePlatform");
const { createJobBoardAdapter } = require("./createJobBoardAdapter");

module.exports = createJobBoardAdapter({ name: "internshala", label: "Internshala", scrape: makeScraper("internshala") });
