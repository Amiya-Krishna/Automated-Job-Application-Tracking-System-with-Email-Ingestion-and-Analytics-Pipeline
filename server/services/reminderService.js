// Interview / application / job reminders, delivered as Expo push notifications.
//
// Exactly-once: before sending, a row is inserted into notification_log with a
// deterministic dedupe key (unique per user). A second run — or a second server
// instance — hits the unique constraint and skips. If nothing could be
// delivered (no working device) the row is removed so the next run retries.
//
// Timing is evaluated in each user's own timezone (set by the app), and a
// reminder is due once the local time is >= the user's reminder hour, so a
// short outage never loses a reminder for the day.
const DEFAULTS = { pushEnabled: true, interviewReminders: true, applicationReminders: true, jobReminders: true, timezone: "UTC", reminderHour: 9 };
const FOLLOW_UP_AFTER_DAYS = () => Number(process.env.FOLLOW_UP_AFTER_DAYS) || 7;
const FOLLOW_UP_MAX_AGE_DAYS = 30;
const JOB_MIN_SCORE = () => Number(process.env.JOB_REMINDER_MIN_SCORE) || 70;

function validTimezone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// { ymd: "2026-09-29", hour: 9 } for `date` as seen in `timeZone`.
function zonedParts(date, timeZone) {
  const tz = validTimezone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(date)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const dayNumber = (ymd) => Math.floor(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000);
const ymdOf = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? m[1] : null;
};
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// Pure: decides which reminders are due right now. No I/O.
function buildReminders({ prefs, trackedJobs = [], topMatches = [], now = new Date() }) {
  const p = { ...DEFAULTS, ...(prefs || {}) };
  if (!p.pushEnabled) return [];
  const { ymd: today, hour } = zonedParts(now, p.timezone);
  if (hour < p.reminderHour) return [];
  const todayN = dayNumber(today);
  const out = [];

  for (const job of trackedJobs) {
    const target = { pathname: "/application/[id]", params: { id: String(job.id) } };
    const label = `${clip(job.role, 60)} at ${clip(job.company, 60)}`;

    if (p.interviewReminders && job.status === "Interview") {
      const day = ymdOf(job.interviewDate);
      if (day) {
        const diff = dayNumber(day) - todayN;
        if (diff === 1) out.push({ kind: "interview", dedupeKey: `interview:${job.id}:${day}:d1`, title: "Interview tomorrow", body: label, data: { type: "interview", target } });
        if (diff === 0) out.push({ kind: "interview", dedupeKey: `interview:${job.id}:${day}:d0`, title: "Interview today", body: label, data: { type: "interview", target } });
      }
    }

    if (p.applicationReminders && (job.status === "Applied" || !job.status)) {
      const applied = ymdOf(job.applicationDate);
      if (applied) {
        const age = todayN - dayNumber(applied);
        if (age >= FOLLOW_UP_AFTER_DAYS() && age <= FOLLOW_UP_MAX_AGE_DAYS) {
          out.push({ kind: "application", dedupeKey: `followup:${job.id}`, title: "Time to follow up?", body: `No update yet on ${label}.`, data: { type: "application", target } });
        }
      }
    }
  }

  if (p.jobReminders && topMatches.length) {
    const first = topMatches[0];
    const more = topMatches.length - 1;
    out.push({
      kind: "job",
      dedupeKey: `jobs:${today}`,
      title: topMatches.length === 1 ? "New strong job match" : `${topMatches.length} new strong job matches`,
      body: more > 0 ? `${clip(first.title, 80)} and ${more} more` : clip(first.title, 100),
      data: { type: "job", target: topMatches.length === 1 ? { pathname: "/job/[id]", params: { id: String(first.id) } } : { pathname: "/jobs" } },
    });
  }
  return out;
}

async function loadTopMatches(prisma, userId, now) {
  const profile = await prisma.user_profile.findUnique({ where: { user_id: userId }, select: { id: true } });
  if (!profile) return [];
  const rows = await prisma.match_scores.findMany({
    where: { profile_id: profile.id, score: { gte: JOB_MIN_SCORE() }, scored_at: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } },
    orderBy: { score: "desc" },
    take: 3,
    select: { jobs: { select: { id: true, title: true } } },
  });
  return rows.filter((r) => r.jobs).map((r) => ({ id: String(r.jobs.id), title: r.jobs.title }));
}

let running = false;

async function runReminders({ prisma = require("../lib/prisma"), sendToUser = require("./pushService").sendToUser, now = new Date() } = {}) {
  if (running) return { skipped: true };
  running = true;
  const stats = { users: 0, sent: 0, skipped: 0 };
  try {
    // Blocked accounts keep their data but receive no push reminders.
    const owners = await prisma.pushDevice.findMany({ where: { disabledAt: null, user: { status: "ACTIVE" } }, distinct: ["userId"], select: { userId: true } });
    for (const { userId } of owners) {
      try {
        stats.users += 1;
        const prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
        if (prefs && !prefs.pushEnabled) continue;
        const trackedJobs = await prisma.trackedJob.findMany({
          where: { userId, OR: [{ status: "Interview" }, { status: "Applied" }, { status: null }] },
          select: { id: true, company: true, role: true, status: true, interviewDate: true, applicationDate: true },
          take: 500,
        });
        const wantsJobs = !prefs || prefs.jobReminders;
        const topMatches = wantsJobs ? await loadTopMatches(prisma, userId, now) : [];
        for (const r of buildReminders({ prefs, trackedJobs, topMatches, now })) {
          let logRow;
          try {
            logRow = await prisma.notificationLog.create({ data: { userId, kind: r.kind, dedupeKey: r.dedupeKey, title: r.title, body: r.body, data: r.data } });
          } catch (e) {
            if (e && e.code === "P2002") { stats.skipped += 1; continue; }
            throw e;
          }
          // in-app inbox copy, owned by this user only (idempotent per dedupeKey)
          try {
            await require("./notificationService").createNotification(userId, { kind: r.kind, title: r.title, body: r.body, target: r.data && r.data.target, dedupeKey: r.dedupeKey }, prisma);
          } catch (e) { console.error(`inbox write failed for a user: ${e.message}`); }
          const res = await sendToUser(userId, { title: r.title, body: r.body, data: r.data });
          if (res.sent > 0) stats.sent += 1;
          else await prisma.notificationLog.delete({ where: { id: logRow.id } }).catch(() => {});
        }
      } catch (err) {
        console.error(`reminder run failed for a user: ${err.message}`);
      }
    }
    return stats;
  } finally {
    running = false;
  }
}

function startReminderScheduler() {
  if (process.env.REMINDERS_ENABLED === "false") return null;
  const everyMs = (Number(process.env.REMINDER_INTERVAL_MINUTES) || 15) * 60 * 1000;
  const tick = () => runReminders().catch((e) => console.error("reminder tick failed:", e.message));
  const timer = setInterval(tick, everyMs);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { buildReminders, runReminders, startReminderScheduler, zonedParts, validTimezone, DEFAULTS };
