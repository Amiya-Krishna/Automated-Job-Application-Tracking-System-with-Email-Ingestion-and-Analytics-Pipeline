// Stateful in-memory stand-in for the parts of Prisma the account lifecycle touches. It is
// deliberately STRICT so the tests prove the service is correct against the real database rules:
//   * user.delete cascades the way prisma/schema.prisma declares (ON DELETE CASCADE relations),
//   * match_scores -> user_profile and jobs.canonical_job_id behave as NO ACTION (the pre-migration
//     behaviour): deleting a referenced row throws a P2003 foreign-key error, so a service that
//     forgot to remove them first fails the test,
//   * $transaction restores a snapshot when the callback throws (so atomicity is tested too).
const clone = (v) => structuredClone(v);
const isObj = (v) => v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v);

function fkError() {
  const e = new Error("Foreign key constraint failed");
  e.code = "P2003";
  return e;
}

function createAccountDb() {
  const T = { users: [], sessions: [], trackedJobs: [], notifications: [], profiles: [], scores: [], jobs: [], companies: [], resumes: [], devices: [], scrapeRuns: [] };
  const seq = { users: 100, sessions: 0, profiles: 0, jobs: 1000, scores: 0 };

  // ---- where evaluation (just what the routes/services use) ----
  const matchValue = (v, cond) => {
    if (!isObj(cond)) return v === cond;
    return Object.entries(cond).every(([op, arg]) => {
      if (op === "mode") return true;
      if (op === "equals") return v === arg;
      if (op === "in") return arg.includes(v);
      if (op === "not") return v !== arg;
      if (op === "contains") return String(v ?? "").toLowerCase().includes(String(arg).toLowerCase());
      throw new Error(`accountFakePrisma: unsupported operator ${op}`);
    });
  };
  const match = (row, where = {}) => Object.entries(where).every(([k, cond]) => {
    if (k === "OR") return cond.some((c) => match(row, c));
    if (k === "AND") return [].concat(cond).every((c) => match(row, c));
    if (k === "NOT") return ![].concat(cond).some((c) => match(row, c));
    if (k === "user") return T.users.some((u) => u.id === row.userId && match(u, cond));
    return matchValue(row[k], cond);
  });

  const applyData = (row, data) => {
    for (const [k, v] of Object.entries(data)) {
      if (isObj(v) && "increment" in v) row[k] = (row[k] || 0) + v.increment;
      else row[k] = v;
    }
    return row;
  };
  const pick = (row, select) => {
    if (!select) return { ...row };
    const out = {};
    for (const [k, on] of Object.entries(select)) {
      if (k === "_count") out._count = { trackedJobs: T.trackedJobs.filter((j) => j.userId === row.id).length };
      else if (on) out[k] = row[k];
    }
    return out;
  };

  const userModel = {
    findUnique: async ({ where, select }) => {
      const u = T.users.find((x) => (where.id !== undefined ? x.id === where.id : x.email === where.email));
      return u ? pick(u, select) : null;
    },
    findMany: async ({ where, select, skip = 0, take } = {}) => {
      const rows = T.users.filter((u) => match(u, where)).sort((a, b) => a.id - b.id).slice(skip, take ? skip + take : undefined);
      return rows.map((u) => pick(u, select));
    },
    count: async ({ where } = {}) => T.users.filter((u) => match(u, where)).length,
    create: async ({ data }) => { const row = { id: ++seq.users, role: "user", status: "ACTIVE", tokenVersion: 0, blockedAt: null, gmailRefreshToken: null, createdAt: new Date(), ...data }; T.users.push(row); return row; },
    update: async ({ where, data }) => { const u = T.users.find((x) => x.id === where.id); if (!u) { const e = new Error("not found"); e.code = "P2025"; throw e; } return applyData(u, data); },
    updateMany: async ({ where, data }) => { const rows = T.users.filter((u) => match(u, where)); rows.forEach((r) => applyData(r, data)); return { count: rows.length }; },
    delete: async ({ where }) => {
      const u = T.users.find((x) => x.id === where.id);
      if (!u) { const e = new Error("not found"); e.code = "P2025"; throw e; }
      const profile = T.profiles.find((p) => p.user_id === u.id);
      if (profile && T.scores.some((s) => s.profile_id === profile.id)) throw fkError(); // match_scores -> user_profile is NO ACTION
      const ownedIds = T.jobs.filter((j) => j.owner_user_id === u.id).map((j) => j.id);
      if (T.jobs.some((j) => ownedIds.includes(j.canonical_job_id) && j.owner_user_id !== u.id)) throw fkError(); // canonical_job_id is NO ACTION
      T.users = T.users.filter((x) => x.id !== u.id);
      for (const k of ["sessions", "trackedJobs", "notifications", "profiles", "resumes", "devices", "scrapeRuns"]) T[k] = T[k].filter((r) => r.userId !== u.id && r.user_id !== u.id);
      T.jobs = T.jobs.filter((j) => j.owner_user_id !== u.id); // jobs.owner is ON DELETE CASCADE
      return u;
    },
  };

  const prisma = {
    user: userModel,
    userSession: {
      create: async ({ data }) => { const row = { id: `sess-${++seq.sessions}`, createdAt: new Date(), lastUsedAt: new Date(), revokedAt: null, rotatedAt: null, ...data }; T.sessions.push(row); return row; },
      findUnique: async ({ where }) => T.sessions.find((s) => (where.id ? s.id === where.id : s.refreshTokenHash === where.refreshTokenHash)) || null,
      update: async ({ where, data }) => applyData(T.sessions.find((s) => s.id === where.id), data),
      updateMany: async ({ where, data }) => { const rows = T.sessions.filter((s) => match(s, where)); rows.forEach((r) => applyData(r, data)); return { count: rows.length }; },
      groupBy: async ({ where }) => {
        const by = new Map();
        for (const s of T.sessions.filter((x) => match(x, where))) by.set(s.userId, !by.get(s.userId) || s.lastUsedAt > by.get(s.userId) ? s.lastUsedAt : by.get(s.userId));
        return [...by].map(([userId, lastUsedAt]) => ({ userId, _max: { lastUsedAt } }));
      },
    },
    user_profile: { findUnique: async ({ where }) => T.profiles.find((p) => p.user_id === where.user_id) || null },
    match_scores: { deleteMany: async ({ where }) => { const n = T.scores.length; T.scores = T.scores.filter((s) => s.profile_id !== where.profile_id); return { count: n - T.scores.length }; } },
    jobs: {
      findMany: async ({ where }) => T.jobs.filter((j) => (where.owner_user_id !== undefined ? j.owner_user_id === where.owner_user_id : true)).map((j) => ({ id: j.id })),
      updateMany: async ({ where, data }) => {
        const ids = where.canonical_job_id.in;
        const rows = T.jobs.filter((j) => ids.includes(j.canonical_job_id) && j.owner_user_id !== where.OR[1].owner_user_id.not);
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      deleteMany: async ({ where }) => { const n = T.jobs.length; T.jobs = T.jobs.filter((j) => j.owner_user_id !== where.owner_user_id); return { count: n - T.jobs.length }; },
    },
    $transaction: async (fn) => {
      const snapshot = clone(T);
      try {
        return await fn(prisma);
      } catch (err) {
        for (const k of Object.keys(T)) T[k] = snapshot[k];
        throw err;
      }
    },
  };

  const add = {
    user: (data) => { const row = { id: ++seq.users, role: "user", status: "ACTIVE", tokenVersion: 0, blockedAt: null, gmailRefreshToken: null, createdAt: new Date(), ...data }; T.users.push(row); return row; },
    profile: (userId) => { const row = { id: ++seq.profiles, user_id: userId }; T.profiles.push(row); return row; },
    score: (profileId, jobId) => { const row = { id: ++seq.scores, profile_id: profileId, job_id: jobId }; T.scores.push(row); return row; },
    job: (data) => { const row = { id: ++seq.jobs, owner_user_id: null, canonical_job_id: null, ...data }; T.jobs.push(row); return row; },
    company: (data) => { const row = { id: T.companies.length + 1, ...data }; T.companies.push(row); return row; },
    trackedJob: (userId, data = {}) => { const row = { id: T.trackedJobs.length + 1, userId, ...data }; T.trackedJobs.push(row); return row; },
    notification: (userId, data = {}) => { const row = { id: T.notifications.length + 1, userId, ...data }; T.notifications.push(row); return row; },
    resume: (userId) => { const row = { id: T.resumes.length + 1, userId }; T.resumes.push(row); return row; },
  };

  return { T, prisma, add };
}

module.exports = { createAccountDb };
