"use strict";
/* Tiny local server: serves index.html, the PWA files, and forwards /api/* to the api/ folder. Needs Node 18+. */
const http = require("http");
const fs = require("fs");
const path = require("path");

// Minimal .env loader so you do not need any packages.
try {
  const env = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) return;
    const v = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  });
} catch (e) { /* no .env yet, that is fine */ }

const PORT = Number(process.env.PORT || 3000);
const HANDLERS = {};
["coach", "push", "cron"].forEach((n) => { HANDLERS[n] = require("./api/" + n + ".js"); });

// Only these files are served as static assets.
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/sw.js": ["sw.js", "text/javascript; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/icons/icon-180.png": ["icons/icon-180.png", "image/png"],
  "/icons/icon-192.png": ["icons/icon-192.png", "image/png"],
  "/icons/icon-512.png": ["icons/icon-512.png", "image/png"]
};

function send(res, code, type, body) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const api = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (api && HANDLERS[api[1]]) {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    try { await HANDLERS[api[1]](req, res); } catch (e) { console.error(e); if (!res.writableEnded) res.status(500).json({ error: "server", message: "Something went wrong on the server." }); }
    return;
  }
  const f = STATIC[url.pathname];
  if (f) return fs.readFile(path.join(__dirname, f[0]), (err, data) => err ? send(res, 404, "text/plain", f[0] + " not found") : send(res, 200, f[1], data));
  if (url.pathname === "/favicon.ico") return send(res, 204, "image/x-icon", "");
  send(res, 404, "text/plain", "Not found");
}).listen(PORT, () => {
  console.log("Raceplan running at http://localhost:" + PORT);
  console.log(process.env.DEEPSEEK_API_KEY ? "Coach: DeepSeek key found." : "Coach: no DEEPSEEK_API_KEY yet. Copy .env.example to .env and add your key.");
  console.log(process.env.VAPID_PUBLIC_KEY && process.env.SUPABASE_URL ? "Reminders: configured." : "Reminders: not configured (needs VAPID keys and Supabase, see README).");
});
