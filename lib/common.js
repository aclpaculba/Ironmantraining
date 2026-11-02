"use strict";
/* Small helpers shared by the push endpoints. */
const crypto = require("crypto");

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readJson(req, limit) {
  limit = limit || 60000;
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); } }
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > limit) { resolve(null); req.destroy(); } });
    req.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

// Supabase REST, using the service role key. The key never leaves the server.
async function sb(path, opts) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("store_not_configured");
  opts = opts || {};
  const r = await fetch(url.replace(/\/+$/, "") + "/rest/v1/" + path, {
    method: opts.method || "GET",
    headers: Object.assign({ apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!r.ok) throw new Error("store_error_" + r.status);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

function webpush() {
  const wp = require("web-push");
  wp.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:you@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return wp;
}

// Only real browser push services, so the server cannot be pointed at arbitrary URLs.
function okEndpoint(ep) {
  try {
    const u = new URL(ep);
    return u.protocol === "https:" && /(^|\.)(push\.apple\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/.test(u.hostname);
  } catch (e) { return false; }
}

module.exports = { safeEqual, readJson, sb, webpush, okEndpoint };
