const router = require("express").Router();
const crypto = require("crypto");
const auth = require("../middleware/authMiddleware");
const { createRateLimiter } = require("../middleware/rateLimit");
const prisma = require("../lib/prisma");
const { isExpoToken, sendToUser } = require("../services/pushService");
const inbox = require("../services/notificationService");
const { runReminders, validTimezone, DEFAULTS } = require("../services/reminderService");

const deviceLimiter = createRateLimiter({ name: "notif-device", windowMs: 15 * 60 * 1000, max: 60 });
const testLimiter = createRateLimiter({ name: "notif-test", windowMs: 10 * 60 * 1000, max: 5 });

const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const toPrefs = (row) => ({
  pushEnabled: row.pushEnabled,
  interviewReminders: row.interviewReminders,
  applicationReminders: row.applicationReminders,
  jobReminders: row.jobReminders,
  timezone: row.timezone,
  reminderHour: row.reminderHour,
});

// ---- In-app inbox (per user) --------------------------------------------------------------
// Every handler passes req.user.id into the service, which puts it in the query. A foreign or
// unknown id is a plain 404, so ids can't be probed.
const parseNid = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

router.get("/inbox", auth, async (req, res) => {
  try {
    res.json(await inbox.listForUser(req.user.id, { limit: req.query.limit, unreadOnly: req.query.unread === "true" }));
  } catch (error) { res.status(500).json({ message: "Could not load notifications" }); }
});

// Clients record their own in-app events (job saved, status changed, resume tailored, ...).
// The notification is ALWAYS created for the caller; there is no way to address another user.
const createLimiter = createRateLimiter({ name: "notif-create", windowMs: 60 * 1000, max: 60 });
router.post("/inbox", auth, createLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    if (typeof b.title !== "string" || !b.title.trim()) return res.status(400).json({ message: "title is required" });
    let target = null;
    if (b.target !== undefined && b.target !== null) {
      if (typeof b.target !== "object" || Array.isArray(b.target) || JSON.stringify(b.target).length > 400) return res.status(400).json({ message: "target must be a small object" });
      target = b.target;
    }
    const row = await inbox.createNotification(req.user.id, { kind: b.kind, title: b.title, body: typeof b.body === "string" ? b.body : "", target });
    res.status(201).json({ data: row && inbox.shape(row), unreadCount: await inbox.unreadCountForUser(req.user.id) });
  } catch (error) { res.status(500).json({ message: "Could not save notification" }); }
});

router.get("/inbox/unread-count", auth, async (req, res) => {
  try { res.json({ unreadCount: await inbox.unreadCountForUser(req.user.id) }); }
  catch (error) { res.status(500).json({ message: "Could not load notifications" }); }
});

router.post("/inbox/read-all", auth, async (req, res) => {
  try { res.json({ updated: await inbox.markAllRead(req.user.id), unreadCount: 0 }); }
  catch (error) { res.status(500).json({ message: "Could not update notifications" }); }
});

router.post("/inbox/:id/read", auth, async (req, res) => {
  try {
    const id = parseNid(req.params.id);
    if (!id || !(await inbox.markRead(req.user.id, id))) return res.status(404).json({ message: "Notification not found" });
    res.json({ unreadCount: await inbox.unreadCountForUser(req.user.id) });
  } catch (error) { res.status(500).json({ message: "Could not update notification" }); }
});

router.delete("/inbox/:id", auth, async (req, res) => {
  try {
    const id = parseNid(req.params.id);
    if (!id || !(await inbox.deleteOne(req.user.id, id))) return res.status(404).json({ message: "Notification not found" });
    res.json({ unreadCount: await inbox.unreadCountForUser(req.user.id) });
  } catch (error) { res.status(500).json({ message: "Could not delete notification" }); }
});

router.delete("/inbox", auth, async (req, res) => {
  try { res.json({ deleted: await inbox.deleteAll(req.user.id), unreadCount: 0 }); }
  catch (error) { res.status(500).json({ message: "Could not clear notifications" }); }
});

// Register (or refresh) this device's Expo push token. A token identifies a
// physical install, so if it was last used by another account it moves here.
router.post("/devices", auth, deviceLimiter, async (req, res) => {
  try {
    const { expoPushToken, platform, deviceName, appVersion, timezone } = req.body || {};
    if (!isExpoToken(expoPushToken)) return res.status(400).json({ message: "A valid Expo push token is required" });
    const data = {
      userId: req.user.id,
      platform: str(platform, 20),
      deviceName: str(deviceName, 120),
      appVersion: str(appVersion, 40) || str(req.header("x-app-version"), 40),
      disabledAt: null,
      updatedAt: new Date(),
    };
    await prisma.pushDevice.upsert({ where: { expoPushToken }, create: { expoPushToken, ...data }, update: data });
    if (validTimezone(timezone)) {
      await prisma.notificationPreference.upsert({ where: { userId: req.user.id }, create: { userId: req.user.id, timezone }, update: { timezone, updatedAt: new Date() } });
    }
    res.status(201).json({ message: "Device registered" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Unregister (on sign-out). Only ever touches the caller's own devices.
router.delete("/devices", auth, deviceLimiter, async (req, res) => {
  try {
    const token = (req.body || {}).expoPushToken;
    if (!isExpoToken(token)) return res.status(400).json({ message: "A valid Expo push token is required" });
    await prisma.pushDevice.deleteMany({ where: { expoPushToken: token, userId: req.user.id } });
    res.json({ message: "Device removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/preferences", auth, async (req, res) => {
  try {
    const row = await prisma.notificationPreference.findUnique({ where: { userId: req.user.id } });
    res.json({ preferences: row ? toPrefs(row) : { ...DEFAULTS } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put("/preferences", auth, async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    for (const k of ["pushEnabled", "interviewReminders", "applicationReminders", "jobReminders"]) {
      if (b[k] !== undefined) {
        if (typeof b[k] !== "boolean") return res.status(400).json({ message: `${k} must be true or false` });
        patch[k] = b[k];
      }
    }
    if (b.timezone !== undefined) {
      if (!validTimezone(b.timezone)) return res.status(400).json({ message: "Unknown timezone" });
      patch.timezone = b.timezone;
    }
    if (b.reminderHour !== undefined) {
      if (!Number.isInteger(b.reminderHour) || b.reminderHour < 0 || b.reminderHour > 23) return res.status(400).json({ message: "reminderHour must be 0-23" });
      patch.reminderHour = b.reminderHour;
    }
    const row = await prisma.notificationPreference.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...patch },
      update: { ...patch, updatedAt: new Date() },
    });
    res.json({ preferences: toPrefs(row) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Sends a test push to the caller's own devices (Settings -> "Send test").
router.post("/test", auth, testLimiter, async (req, res) => {
  try {
    await inbox.createNotification(req.user.id, { kind: "system", title: "TrackTrail", body: "Push notifications are working.", target: { pathname: "/notifications" } }).catch(() => {});
    const r = await sendToUser(req.user.id, { title: "TrackTrail", body: "Push notifications are working.", data: { type: "system", target: { pathname: "/notifications" } } });
    if (!r.devices) return res.status(404).json({ message: "No registered device. Enable notifications first." });
    res.json({ sent: r.sent, failed: r.failed });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Trigger for free-tier hosts that sleep: an external scheduler (see
// .github/workflows/reminders-cron.yml) calls this with CRON_SECRET, which
// wakes the service and runs one reminder pass.
router.post("/run-reminders", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(404).json({ message: "Not found" });
  const given = String(req.header("x-cron-secret") || "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: "Unauthorized" });
  try {
    res.json(await runReminders());
  } catch (error) {
    res.status(500).json({ message: "Reminder run failed" });
  }
});

module.exports = router;
