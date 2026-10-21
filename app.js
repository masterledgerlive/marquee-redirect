#!/usr/bin/env node
// MARQUEE redirect layer — Node, ZERO dependencies (stdlib http/fs only).
// Why Node stdlib: no npm install step on any host (Railway, a VPS, this VM),
// nothing to audit, starts in milliseconds, and the whole service is this file.
//
// Redirect status: 302 (not 301). Browsers cache 301s hard — a cached 301
// never touches our server again, which would silently kill the hit stats that
// are the entire point of this layer ("our stats"). 302 is followed instantly,
// is not permanently cached, and every click re-hits us and gets logged.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------- CONFIG (edit here) ----------
const PORT = process.env.PORT || 8377;
const STATS_FILE = process.env.STATS_FILE || path.join(__dirname, 'stats.log');
// Muse landing target — the controlled page that shows code BUD12L on the phone.
// Confirmed live 2026-10-20: https://muse.ai/s/billion-token-referral-dt6f2fhxixcbx0
// Fallback if the hub ever dies: "https://muse.ai/join"
const MUSE_TARGET = 'https://muse.ai/s/billion-token-referral-dt6f2fhxixcbx0';
const MUSE_ALIASES = ['musebud', 'billiontokens', 'bud12l'];
// -----------------------------------------

const registry = JSON.parse(fs.readFileSync(path.join(__dirname, 'aliases.json'), 'utf8'));
for (const a of MUSE_ALIASES) registry[a] = MUSE_TARGET;
delete registry._comment;
const BASES = Object.keys(registry).sort((a, b) => b.length - a.length);

function uaFamily(ua) {
  if (!ua) return 'none';
  const u = ua.toLowerCase();
  if (/bot|crawler|spider|curl|wget|python|httpclient/.test(u)) return 'bot/tool';
  if (/iphone|ipad/.test(u)) return 'ios';
  if (/android/.test(u)) return 'android';
  if (/windows/.test(u)) return 'windows';
  if (/macintosh|mac os/.test(u)) return 'mac';
  if (/linux/.test(u)) return 'linux';
  return 'other';
}

// Resolve a canonical (lowercased, slash-trimmed) path to {alias, tag, target} or null.
// Per-board variants: <base>-<tag> e.g. plasma800-fl120584 → base plasma800, tag fl120584.
function resolve(canon) {
  if (registry[canon]) return { alias: canon, tag: null, target: registry[canon] };
  for (const base of BASES) {
    if (canon.startsWith(base + '-')) {
      const tag = canon.slice(base.length + 1);
      if (tag) return { alias: base, tag, target: registry[base] };
    }
  }
  return null;
}

function logHit(rec) {
  try { fs.appendFileSync(STATS_FILE, JSON.stringify(rec) + '\n'); }
  catch (e) { console.error('stats write failed:', e.message); }
}

const CAMPAIGNS = [
  ['Muse — 1 Billion Tokens (code BUD12L)', 'musebud'],
  ['Grass — Your WiFi Pays You (points)', 'grasspoints'],
  ['Grifols Plasma — New Donors Earn Up To $800', 'plasma800'],
  ['Blip Billboards — $50 Credit / Friends $25', 'blip50'],
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const rawPath = url.pathname;
  const canon = rawPath.replace(/^\/+|\/+$/g, '').toLowerCase();

  if (canon === 'health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'marquee-redirect', aliases: BASES.length }));
  }
  if (canon === '') {
    const rows = CAMPAIGNS.map(([label, a]) =>
      `<li><strong>${label}:</strong> <a href="/${a}">/${a}</a></li>`).join('\n');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><title>Marquee Links</title><h1>MARQUEE — Link Hub</h1><ul>${rows}</ul><p>Links work in any case. Per-board variants: /plasma800-fl120584</p>`);
  }

  const hit = resolve(canon);
  if (!hit) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><title>Not found</title><h1>404 — that link is not one of ours.</h1>');
  }

  logHit({
    ts: new Date().toISOString(),
    alias_raw: rawPath.replace(/^\/+|\/+$/g, ''),
    alias_canonical: hit.tag ? `${hit.alias}-${hit.tag}` : hit.alias,
    placement_tag: hit.tag,
    target: hit.target,
    referer: req.headers.referer || req.headers.referrer || null,
    ua_family: uaFamily(req.headers['user-agent']),
  });

  res.writeHead(302, { Location: hit.target, 'Cache-Control': 'no-store' });
  res.end();
});

server.listen(PORT, () => console.log(`marquee-redirect listening on :${PORT}`));
