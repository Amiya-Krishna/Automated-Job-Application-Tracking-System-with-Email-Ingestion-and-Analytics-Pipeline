// Tiny in-memory Prisma that really EVALUATES `where` filters (AND / OR / equals / not / in /
// contains / gte / relation `some`), so route tests prove the filters isolate users instead of
// merely being passed through. Only what the ownership-sensitive routes use is implemented.
const isObj = (v) => v && typeof v === "object" && !(v instanceof Date) && typeof v !== "bigint" && !Array.isArray(v);
const norm = (v) => (v === undefined ? null : typeof v === "bigint" ? Number(v) : v);

function makeDb(relations) {
  const T = {}; // table name -> rows
  const counters = {};
  const match = (table, row, where = {}) => Object.entries(where).every(([k, cond]) => {
    if (k === "AND") return [].concat(cond).every((c) => match(table, row, c));
    if (k === "OR") return cond.some((c) => match(table, row, c));
    if (k === "NOT") return ![].concat(cond).some((c) => match(table, row, c));
    const rel = relations[table] && relations[table][k];
    if (rel) {
      const kids = (T[rel.table] || []).filter((r) => norm(r[rel.fk]) === norm(row.id));
      if (cond.some) return kids.some((r) => match(rel.table, r, cond.some));
      return true;
    }
    const v = norm(row[k]);
    if (!isObj(cond)) return v === norm(cond);
    return Object.entries(cond).every(([op, arg]) => {
      if (op === "mode") return true;
      if (op === "equals") return cond.mode === "insensitive" ? String(v).toLowerCase() === String(arg).toLowerCase() : v === norm(arg);
      if (op === "not") return isObj(arg) ? !match(table, { [k]: row[k] }, { [k]: arg }) : v !== null && v !== norm(arg);
      if (op === "in") return arg.map(norm).includes(v);
      if (op === "notIn") return !arg.map(norm).includes(v);
      if (op === "contains") return cond.mode === "insensitive" ? String(v ?? "").toLowerCase().includes(String(arg).toLowerCase()) : String(v ?? "").includes(arg);
      if (op === "gte") return v >= arg;
      throw new Error(`fakePrisma: unsupported operator ${op}`);
    });
  });

  const project = (table, row, args = {}) => {
    let out = { ...row };
    const rels = relations[table] || {};
    const spec = args.include || args.select;
    if (args.select) { out = {}; for (const [k, on] of Object.entries(args.select)) if (on === true) out[k] = row[k]; }
    if (spec) for (const [k, sub] of Object.entries(spec)) {
      if (k === "_count") {
        out._count = {};
        for (const [rk, rs] of Object.entries(sub.select)) {
          const r = rels[rk]; const w = isObj(rs) ? rs.where : undefined;
          out._count[rk] = (T[r.table] || []).filter((x) => norm(x[r.fk]) === norm(row.id) && match(r.table, x, w)).length;
        }
      } else if (rels[k]) {
        const r = rels[k]; const w = isObj(sub) ? sub.where : undefined;
        let kids = (T[r.table] || []).filter((x) => norm(x[r.fk]) === norm(row.id) && match(r.table, x, w));
        if (isObj(sub) && sub.take) kids = kids.slice(0, sub.take);
        out[k] = kids.map((x) => project(r.table, x, isObj(sub) ? sub : {}));
      } else if (relations[table] && relations[table][`$${k}`]) {
        const r = relations[table][`$${k}`]; // to-one: this row holds the fk
        const t = (T[r.table] || []).find((x) => norm(x.id) === norm(row[r.fk]));
        out[k] = t ? project(r.table, t, isObj(sub) ? sub : {}) : null;
      }
    }
    return out;
  };

  const model = (name) => ({
    _rows: () => T[name],
    findMany: async (a = {}) => {
      let rows = (T[name] || []).filter((r) => match(name, r, a.where));
      if (a.distinct) { const seen = new Set(); rows = rows.filter((r) => { const k = a.distinct.map((d) => r[d]).join("|"); if (seen.has(k)) return false; seen.add(k); return true; }); }
      if (a.orderBy) { const [[k, dir]] = Object.entries(Array.isArray(a.orderBy) ? a.orderBy[0] : a.orderBy); rows = [...rows].sort((x, y) => (x[k] > y[k] ? 1 : x[k] < y[k] ? -1 : 0) * (dir === "desc" ? -1 : 1)); }
      if (a.skip) rows = rows.slice(a.skip);
      if (a.take) rows = rows.slice(0, a.take);
      return rows.map((r) => project(name, r, a));
    },
    findFirst: async (a = {}) => (await model(name).findMany({ ...a, take: 1 }))[0] || null,
    findUnique: async (a) => (await model(name).findMany({ ...a, take: 1 }))[0] || null,
    count: async (a = {}) => (T[name] || []).filter((r) => match(name, r, a.where)).length,
    groupBy: async ({ by, where }) => {
      const g = new Map();
      for (const r of (T[name] || []).filter((x) => match(name, x, where))) { const k = by.map((b) => r[b]).join("|"); g.set(k, { ...Object.fromEntries(by.map((b) => [b, r[b]])), _count: { _all: (g.get(k)?._count._all || 0) + 1 } }); }
      return [...g.values()];
    },
    create: async ({ data }) => {
      const rows = (T[name] ||= []);
      counters[name] = (counters[name] || 0) + 1;
      const row = { id: counters[name], createdAt: new Date(), readAt: null, ...data };
      if (name === "notification" && row.dedupeKey && rows.some((r) => r.userId === row.userId && r.dedupeKey === row.dedupeKey)) { const e = new Error("unique"); e.code = "P2002"; throw e; }
      rows.push(row); return { ...row };
    },
    update: async ({ where, data }) => { const r = (T[name] || []).find((x) => match(name, x, where)); Object.assign(r, data); return { ...r }; },
    updateMany: async ({ where, data }) => { const rs = (T[name] || []).filter((x) => match(name, x, where)); rs.forEach((r) => Object.assign(r, data)); return { count: rs.length }; },
    deleteMany: async ({ where }) => { const keep = (T[name] || []).filter((x) => !match(name, x, where)); const n = (T[name] || []).length - keep.length; T[name] = keep; return { count: n }; },
    upsert: async ({ where, update, create }) => { const r = (T[name] || []).find((x) => match(name, x, where)); return r ? Object.assign(r, update) : model(name).create({ data: create }); },
  });

  return { T, counters, model, seed: (name, rows) => { T[name] = rows.map((r, i) => ({ id: i + 1, ...r })); counters[name] = Math.max(0, ...T[name].map((r) => r.id)); } };
}

module.exports = { makeDb };
