const { query } = require("../db/pg");

// Maps a DB row (snake_case) to the camelCase shape the rest of the
// app expects, so callers don't need to know about column names.
function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    gmailRefreshToken: row.gmail_refresh_token,
  };
}

async function findByEmail(email) {
  const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
  return toUser(rows[0]);
}

async function findById(id) {
  const { rows } = await query("SELECT * FROM users WHERE id = $1", [id]);
  return toUser(rows[0]);
}

async function create({ name, email, password }) {
  const { rows } = await query(
    "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
    [name, email, password]
  );
  return toUser(rows[0]);
}

async function setGmailRefreshToken(id, token) {
  const { rows } = await query(
    "UPDATE users SET gmail_refresh_token = $2 WHERE id = $1 RETURNING *",
    [id, token]
  );
  return toUser(rows[0]);
}

module.exports = { findByEmail, findById, create, setGmailRefreshToken };
