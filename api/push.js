"use strict";
/*
 * Raceplan reminders: stores your phone's push subscription and sends a test notification.
 * GET  -> { ok, vapid, store, publicKey }
 * POST -> { action: "subscribe" | "update" | "unsubscribe" | "test", subscription, tz, time, days }
 */
const { safeEqual, readJson, sb, webpush, okEndpoint } = require("../lib/common.js");

function validTz(tz) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch (e) { return false; } }

// Up to 5 reminder times a day, as "HH:MM", sorted, no duplicates. Stored comma-separated in remind_time.
function cleanTimes(t, single) {
  const list = (Array.isArray(t) ? t : [single]).map(String).filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x));
  const out = Array.from(new Set(list)).sort().slice(0, 5);
  return out.length ? out : ["07:00"];
}

function cleanDays(d) {
  const out = {};
  if (!d || typeof d !== "object") return out;
  Object.keys(d).slice(0, 40).forEach((k) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d[k]) return;
    out[k] = { t: String(d[k].t || "").slice(0, 80), s: String(d[k].s || "").slice(0, 140), d: d[k].d ? 1 : 0 };
  });
  return out;
}

module.exports = async function handler(req, res) {
  const pass = process.env.APP_PASSCODE;
  res.setHeader("Cache-Control", "no-store");
  const vapid = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const store = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

  if (req.method === "GET") return res.status(200).json({ ok: true, vapid, store, publicKey: vapid ? process.env.VAPID_PUBLIC_KEY : null, needsPasscode: !!pass });
  if (req.method !== "POST") return res.status(405).json({ error: "method", message: "Use POST." });
  if (pass && !safeEqual(req.headers["x-app-passcode"] || "", pass)) return res.status(401).json({ error: "passcode", message: "Wrong or missing passcode." });
  if (!vapid || !store) return res.status(500).json({ error: "not_configured", message: "Reminders are not set up on the server yet. See the README." });

  const b = await readJson(req);
  if (!b || typeof b !== "object") return res.status(400).json({ error: "bad_request", message: "That request could not be read." });
  const sub = b.subscription;
  const endpoint = sub && sub.endpoint;
  if (!endpoint || !sub.keys || !okEndpoint(endpoint)) return res.status(400).json({ error: "bad_subscription", message: "That notification subscription was not valid." });

  try {
    if (b.action === "unsubscribe") {
      await sb("push_subscriptions?endpoint=eq." + encodeURIComponent(endpoint), { method: "DELETE" });
      return res.status(200).json({ ok: true });
    }
    if (b.action === "subscribe" || b.action === "update") {
      const tz = validTz(b.tz) ? b.tz : "UTC";
      const time = cleanTimes(b.times, b.time).join(",");
      await sb("push_subscriptions?on_conflict=endpoint", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: { endpoint, subscription: sub, tz, remind_time: time, days: cleanDays(b.days), updated_at: new Date().toISOString() }
      });
      return res.status(200).json({ ok: true });
    }
    if (b.action === "test") {
      await webpush().sendNotification(sub, JSON.stringify({ title: "Raceplan reminders are on", body: "You will get a note like this on your training days. Tap it to open today's workout.", tag: "raceplan-test", url: "./" }));
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "bad_request", message: "Unknown action." });
  } catch (e) {
    console.error("push error", e && e.message);
    const gone = e && (e.statusCode === 404 || e.statusCode === 410);
    return res.status(gone ? 410 : 500).json({ error: gone ? "gone" : "server", message: gone ? "This phone's subscription has expired. Turn reminders off and on again." : "Could not save your reminder settings. Try again." });
  }
};
