"use strict";
/*
 * Raceplan accounts: username only, no password. Each username has its own saved data.
 * POST { action: "login" | "get" | "save", username, data?, ts? }
 *   login -> finds or creates the user, returns { username, display, data, ts }
 *   get   -> same, but never creates
 *   save  -> stores data if it is newer than what is saved
 */
const { safeEqual, readJson, sb } = require("../lib/common.js");

const MAX_DATA_CHARS = 1000000;

function normName(s) {
  const n = String(s || "").trim().replace(/\s+/g, " ");
  return /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,29}$/.test(n) ? n : null;
}
const q = (s) => encodeURIComponent(s);

module.exports = async function handler(req, res) {
  const pass = process.env.APP_PASSCODE;
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ ok: true, store: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY), needsPasscode: !!pass });
  if (req.method !== "POST") return res.status(405).json({ error: "method", message: "Use POST." });
  if (pass && !safeEqual(req.headers["x-app-passcode"] || "", pass)) return res.status(401).json({ error: "passcode", message: "Wrong or missing passcode." });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "not_configured", message: "Accounts are not set up on the server yet." });

  const b = await readJson(req, MAX_DATA_CHARS + 20000);
  if (!b || typeof b !== "object") return res.status(400).json({ error: "bad_request", message: "That request could not be read." });
  const typed = normName(b.username);
  if (!typed) return res.status(400).json({ error: "bad_username", message: "Use 2 to 30 letters, numbers, spaces, dots, dashes or underscores." });
  const key = typed.toLowerCase();

  try {
    const rows = await sb("app_users?select=username,display,data,ts&username=eq." + q(key));
    let row = rows && rows[0];

    if (b.action === "login" || b.action === "get") {
      if (!row && b.action === "login") {
        row = { username: key, display: typed, data: {}, ts: 0 };
        await sb("app_users", { method: "POST", headers: { Prefer: "return=minimal" }, body: row });
      }
      if (!row) return res.status(404).json({ error: "no_user", message: "No account with that username." });
      const has = row.data && Object.keys(row.data).length > 0;
      return res.status(200).json({ ok: true, username: row.username, display: row.display, data: has ? row.data : null, ts: Number(row.ts) || 0, isNew: !has });
    }

    if (b.action === "save") {
      if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return res.status(400).json({ error: "bad_request", message: "Nothing to save." });
      if (JSON.stringify(b.data).length > MAX_DATA_CHARS) return res.status(413).json({ error: "too_big", message: "That is too much data to save." });
      const ts = Number(b.ts) || Date.now();
      if (!row) {
        await sb("app_users", { method: "POST", headers: { Prefer: "return=minimal" }, body: { username: key, display: typed, data: b.data, ts } });
        return res.status(200).json({ ok: true });
      }
      if (ts < Number(row.ts)) return res.status(200).json({ ok: true, stale: true });
      await sb("app_users?username=eq." + q(key), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { data: b.data, ts, updated_at: new Date().toISOString() } });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "bad_request", message: "Unknown action." });
  } catch (e) {
    console.error("user error", e && e.message);
    return res.status(500).json({ error: "server", detail: String(e && e.message), message: "Could not reach the data store (" + String(e && e.message) + "). Check that the app_users table exists and the Supabase URL and key are correct." });
  }
};
