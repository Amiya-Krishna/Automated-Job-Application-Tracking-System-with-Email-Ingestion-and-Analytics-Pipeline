const { pool, query } = require("../db/pg");
const {
  buildLockKey,
  findExactDuplicate,
  findFuzzyDuplicate,
  mergeTrackedJob,
  normalizeTrackedJobInput,
} = require("../services/trackedJobDedup");

// Maps a DB row (snake_case) to the camelCase shape the rest of the
// app (and the frontend) expects.
function toJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    company: row.company,
    role: row.role,
    applicationDate:
      row.application_date ||
      (row.created_at ? row.created_at.toISOString().slice(0, 10) : null),
    status: row.status,
    interviewDate: row.interview_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function create(input) {
  const normalized = normalizeTrackedJobInput(input);

  if (!normalized.company || !normalized.role) {
    const error = new Error("Company and role are required");
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Why: this keeps concurrent manual/email inserts from racing each
    // other into a duplicate row for the same logical job.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      buildLockKey(
        input.userId,
        normalized.normalizedCompany,
        normalized.applicationDate,
      ),
    ]);

    const exactDuplicate = await findExactDuplicate(
      client,
      input.userId,
      normalized,
    );
    const fuzzyDuplicate = exactDuplicate
      ? null
      : await findFuzzyDuplicate(client, input.userId, normalized);
    const duplicate = exactDuplicate || fuzzyDuplicate?.candidate || null;

    if (duplicate) {
      if (normalized.duplicateStrategy === "reject") {
        const error = new Error("Duplicate job detected");
        error.status = 409;
        error.code = "DUPLICATE_JOB";
        error.existingJob = toJob(duplicate);
        throw error;
      }

      const merged = mergeTrackedJob(duplicate, normalized);
      const { rows } = await client.query(
        `UPDATE tracked_jobs
         SET company = $2,
             role = $3,
             application_date = $4::date,
             status = $5,
             interview_date = $6,
             notes = $7,
             updated_at = now()
         WHERE id = $1 AND user_id = $8
         RETURNING *`,
        [
          duplicate.id,
          merged.company,
          merged.role,
          merged.applicationDate,
          merged.status,
          merged.interviewDate,
          merged.notes,
          input.userId,
        ],
      );

      await client.query("COMMIT");
      return { job: toJob(rows[0]), action: "merged" };
    }

    const { rows } = await client.query(
      `INSERT INTO tracked_jobs (user_id, company, role, application_date, status, interview_date, notes)
       VALUES ($1, $2, $3, $4::date, COALESCE($5, 'Applied'), $6, $7)
       RETURNING *`,
      [
        input.userId,
        normalized.company,
        normalized.role,
        normalized.applicationDate,
        normalized.status,
        normalized.interviewDate,
        normalized.notes,
      ],
    );

    await client.query("COMMIT");
    return { job: toJob(rows[0]), action: "inserted" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findAllByUser(userId) {
  const { rows } = await query(
    "SELECT * FROM tracked_jobs WHERE user_id = $1 ORDER BY application_date DESC, created_at DESC",
    [userId],
  );
  return rows.map(toJob);
}

async function findOneAndUpdate(id, userId, updates) {
  // Only allow known columns to be updated, so callers can pass the raw
  // req.body through safely without opening up arbitrary column writes.
  const allowed = {
    company: "company",
    role: "role",
    applicationDate: "application_date",
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
      [id, userId],
    );
    return toJob(rows[0]);
  }

  const { rows } = await query(
    `UPDATE tracked_jobs SET ${setClauses.join(", ")}, updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    values,
  );
  return toJob(rows[0]);
}

async function findOneAndDelete(id, userId) {
  const { rows } = await query(
    "DELETE FROM tracked_jobs WHERE id = $1 AND user_id = $2 RETURNING *",
    [id, userId],
  );
  return toJob(rows[0]);
}

module.exports = { create, findAllByUser, findOneAndUpdate, findOneAndDelete };
