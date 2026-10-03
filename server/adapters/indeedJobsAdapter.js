const { scrapeIndeed } = require("../services/scraper");
const { createJobBoardAdapter } = require("./createJobBoardAdapter");

module.exports = createJobBoardAdapter({ name: "indeed", label: "Indeed", scrape: scrapeIndeed });
