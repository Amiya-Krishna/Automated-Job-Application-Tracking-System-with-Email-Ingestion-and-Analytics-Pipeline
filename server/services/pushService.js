// Expo push delivery (free; no SDK needed — plain HTTPS to Expo's push API).
// Tokens that Expo reports as DeviceNotRegistered are disabled automatically.
// Notification bodies contain only what the user already sees in the app
// (company + role); never resume or email content.
const prisma = require("../lib/prisma");

const EXPO_PUSH_URL = process.env.EXPO_PUSH_URL || "https://exp.host/--/api/v2/push/send";
const CHUNK = 100;

const isExpoToken = (t) => typeof t === "string" && /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,}\]$/.test(t);

function headers() {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  // Optional: enables Expo "enhanced push security" when you turn it on.
  if (process.env.EXPO_ACCESS_TOKEN) h.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  return h;
}

async function postChunk(messages, fetchImpl) {
  const res = await fetchImpl(EXPO_PUSH_URL, { method: "POST", headers: headers(), body: JSON.stringify(messages) });
  if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

// messages: [{ to, title, body, data, channelId?, sound? }]. Returns counts.
async function sendPush(messages, { fetchImpl = globalThis.fetch } = {}) {
  const valid = messages.filter((m) => isExpoToken(m.to));
  let sent = 0;
  let failed = 0;
  const dead = [];
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK).map((m) => ({ sound: "default", channelId: "reminders", priority: "high", ...m }));
    try {
      const tickets = await postChunk(chunk, fetchImpl);
      tickets.forEach((t, idx) => {
        if (t && t.status === "ok") sent += 1;
        else {
          failed += 1;
          if (t && t.details && t.details.error === "DeviceNotRegistered") dead.push(chunk[idx].to);
        }
      });
    } catch (err) {
      failed += chunk.length;
      console.error("push send failed:", err.message);
    }
  }
  if (dead.length) {
    try {
      await prisma.pushDevice.updateMany({ where: { expoPushToken: { in: dead } }, data: { disabledAt: new Date() } });
    } catch (e) {
      console.error("could not disable dead push tokens");
    }
  }
  return { sent, failed, skipped: messages.length - valid.length };
}

// Sends to every active device of a user. Returns { sent, failed, devices }.
async function sendToUser(userId, payload, opts) {
  const devices = await prisma.pushDevice.findMany({ where: { userId, disabledAt: null } });
  if (!devices.length) return { sent: 0, failed: 0, devices: 0 };
  const r = await sendPush(devices.map((d) => ({ to: d.expoPushToken, ...payload })), opts);
  return { ...r, devices: devices.length };
}

module.exports = { sendPush, sendToUser, isExpoToken };
