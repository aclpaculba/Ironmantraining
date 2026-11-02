"use strict";
/*
 * Sends the morning reminders. Call it every 15 minutes (see the README).
 * Auth: send CRON_SECRET as "Authorization: Bearer <secret>" or ?secret=<secret>.
 * A subscription gets one reminder per local day, once its reminder time has passed (within a 3 hour window).
 */
const { safeEqual, sb, webpush } = require("../lib/common.js");

function localNow(tz) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: g("year") + "-" + g("month") + "-" + g("day"), min: Number(g("hour")) * 60 + Number(g("minute")) };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: "not_configured", message: "Set CRON_SECRET first." });
  const auth = String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const q = new URL(req.url, "http://x").searchParams.get("secret") || "";
  if (!safeEqual(auth, secret) && !safeEqual(q, secret)) return res.status(401).json({ error: "unauthorized" });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(500).json({ error: "not_configured", message: "VAPID keys are missing." });

  const result = { checked: 0, sent: 0, removed: 0, failed: 0 };
  try {
    const wp = webpush();
    const rows = await sb("push_subscriptions?select=endpoint,subscription,tz,remind_time,days,last_sent_date");
    for (const row of rows || []) {
      result.checked++;
      let now;
      try { now = localNow(row.tz); } catch (e) { continue; }
      const [hh, mm] = String(row.remind_time).split(":").map(Number);
      const since = now.min - (hh * 60 + mm);
      if (since < 0 || since > 180 || row.last_sent_date === now.date) continue;
      const day = row.days && row.days[now.date];
      if (!day) continue; // rest day, or the app has not been opened lately enough to know today's plan
      try {
        await wp.sendNotification(row.subscription, JSON.stringify({ title: "Today: " + day.t, body: day.s || "Open Raceplan for the full session.", tag: "raceplan-daily", url: "./" }));
        await sb("push_subscriptions?endpoint=eq." + encodeURIComponent(row.endpoint), { method: "PATCH", body: { last_sent_date: now.date } });
        result.sent++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          await sb("push_subscriptions?endpoint=eq." + encodeURIComponent(row.endpoint), { method: "DELETE" }).catch(() => {});
          result.removed++;
        } else { result.failed++; console.error("send failed", e && (e.statusCode || e.message)); }
      }
    }
    return res.status(200).json(Object.assign({ ok: true }, result));
  } catch (e) {
    console.error("cron error", e && e.message);
    return res.status(500).json({ error: "server", message: String(e && e.message) });
  }
};
