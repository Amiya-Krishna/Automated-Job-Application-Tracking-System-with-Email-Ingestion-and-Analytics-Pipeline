const { query } = require("../db/pg");

// Maps a DB row (snake_case) to the camelCase shape the rest of the
// app (and the frontend) expects.
function toJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    company: row.company,
    role: row.role,
    status: row.status,
    interviewDate: row.interview_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function create({ userId, company, role, status, interviewDate, notes }) {
  const { rows } = await query(
    `INSERT INTO tracked_jobs (user_id, company, role, status, interview_date, notes)
     VALUES ($1, $2, $3, COALESCE($4, 'Applied'), $5, $6)
     RETURNING *`,
    [userId, company, role, status, interviewDate, notes]
  );
  return toJob(rows[0]);
}

async function findAllByUser(userId) {
  const { rows } = await query(
    "SELECT * FROM tracked_jobs WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return rows.map(toJob);
}

async function findOneAndUpdate(id, userId, updates) {
  // Only allow known columns to be updated, so callers can pass the raw
  // req.body through safely without opening up arbitrary column writes.
  const allowed = {
    company: "company",
    role: "role",
    status: "status",
    interviewDate: "interview_date",
    notes: "notes",
  };

  const setClauses = [];
  const values = [id, userId];

  for (const [key, column] of Object.entries(allowed)) {
    if (updates[key] !== undefined) {
      values.push(updates[key]);
      setClauses.push(`${column} = $${values.length}`);
    }
  }

  if (setClauses.length === 0) {
    // Nothing to update — just return the current row (if it belongs to the user).
    const { rows } = await query(
      "SELECT * FROM tracked_jobs WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    return toJob(rows[0]);
  }

  const { rows } = await query(
    `UPDATE tracked_jobs SET ${setClauses.join(", ")}, updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    values
  );
  return toJob(rows[0]);
}

async function findOneAndDelete(id, userId) {
  const { rows } = await query(
    "DELETE FROM tracked_jobs WHERE id = $1 AND user_id = $2 RETURNING *",
    [id, userId]
  );
  return toJob(rows[0]);
}

module.exports = { create, findAllByUser, findOneAndUpdate, findOneAndDelete };
