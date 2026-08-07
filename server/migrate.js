// migrate.js
const { Client } = require("pg");
const fs = require("fs");
require("dotenv").config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL,
});

async function run() {
  try {
    await client.connect();

    const sql = fs.readFileSync("./db/schema.sql", "utf-8");

    await client.query(sql);

    console.log("Migration done ✅");
  } catch (err) {
    console.error("Migration failed ❌", err);
  } finally {
    await client.end();
  }
}

run();
