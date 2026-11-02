"use strict";
/*
 * Sends the workout reminders. Call it every 15 minutes (see the README).
 * Auth: send CRON_SECRET as "Authorization: Bearer <secret>" or ?secret=<secret>.
 * Each subscription has up to 5 reminder times a day (remind_time is "07:00,12:30,18:00").
 * A time is sent once per local day, within 3 hours after it passes. If several are due at once, only the latest is sent.
 * If the workout is already marked done, nothing is sent.
 * last_sent_date holds "YYYY-MM-DD|07:00,12:30" (the times already handled today).
 */
const { safeEqual, sb, webpush } = require("../lib/common.js");

function localNow(tz) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: g("year") + "-" + g("month") + "-" + g("day"), min: Number(g("hour")) * 60 + Number(g("minute")) };
}
function mins(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

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
      const parts = String(row.last_sent_date || "").split("|");
      const handled = parts[0] === now.date ? (parts[1] ? parts[1].split(",") : (parts.length === 1 ? ["*"] : [])) : [];
      if (handled.indexOf("*") >= 0) continue; // old single-time format: already sent today
      const due = String(row.remind_time).split(",").filter((t) => /^\d\d:\d\d$/.test(t)).filter((t) => {
        const since = now.min - mins(t);
        return since >= 0 && since <= 180 && handled.indexOf(t) < 0;
      }).sort();
      if (!due.length) continue;
      const day = row.days && row.days[now.date];
      if (!day || day.d) continue; // rest day, nothing known for today, or already done
      const all = String(row.remind_time).split(",").filter(Boolean).sort();
      const first = due[due.length - 1] === all[0];
      const payload = JSON.stringify({
        title: (first ? "Today: " : "Reminder: ") + day.t,
        body: (first ? "" : "Not done yet. ") + (day.s || "Tap to open today's workout."),
        tag: "raceplan-daily",
        url: "./?open=" + now.date
      });
      try {
        await wp.sendNotification(row.subscription, payload);
        await sb("push_subscriptions?endpoint=eq." + encodeURIComponent(row.endpoint), { method: "PATCH", body: { last_sent_date: now.date + "|" + handled.concat(due).join(",") } });
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
