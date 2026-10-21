// MARQUEE redirect layer — Cloudflare Worker variant (same logic as app.js).
// Stats: Workers have no filesystem — each hit is emitted as one structured
// console.log JSON line, visible in Workers Logs / Logpush. For durable stats,
// bind a KV namespace named STATS in wrangler.toml and the counter block below
// activates automatically (per-alias daily counts).
//
// Redirect status 302 (same reasoning as app.js: 301 gets permanently cached
// by browsers and would stop hits from ever reaching our stats).

const MUSE_TARGET = 'https://muse.ai/s/billion-token-referral-dt6f2fhxixcbx0'; // fallback: https://muse.ai/join
const REGISTRY = {
  blip50: 'https://blipbillboards.com/referral-program/?utm_source=promo&utm_campaign=tsmxtd&utm_content=fwckmg',
  musebud: MUSE_TARGET,
  billiontokens: MUSE_TARGET,
  bud12l: MUSE_TARGET,
  grasspoints: 'https://app.grass.io/register?referralCode=b3HNupZPHk3JrzE',
  getgrass: 'https://app.grass.io/register?referralCode=b3HNupZPHk3JrzE',
  grasswifi: 'https://app.grass.io/register?referralCode=b3HNupZPHk3JrzE',
  grassapp: 'https://app.grass.io/register?referralCode=b3HNupZPHk3JrzE',
  plasma800: 'https://identity.grifolsplasmadonorhub.com/donor/SelfRegister?referralCode=LumberQuebec0987&lang=en',
};
const BASES = Object.keys(REGISTRY).sort((a, b) => b.length - a.length);
const CAMPAIGNS = [
  ['Muse — 1 Billion Tokens (code BUD12L)', 'musebud'],
  ['Grass — Your WiFi Pays You (points)', 'grasspoints'],
  ['Grifols Plasma — New Donors Earn Up To $800', 'plasma800'],
  ['Blip Billboards — $50 Credit / Friends $25', 'blip50'],
];

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

function resolve(canon) {
  if (REGISTRY[canon]) return { alias: canon, tag: null, target: REGISTRY[canon] };
  for (const base of BASES) {
    if (canon.startsWith(base + '-')) {
      const tag = canon.slice(base.length + 1);
      if (tag) return { alias: base, tag, target: REGISTRY[base] };
    }
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const rawPath = url.pathname;
    const canon = rawPath.replace(/^\/+|\/+$/g, '').toLowerCase();

    if (canon === 'health') {
      return Response.json({ ok: true, service: 'marquee-redirect', aliases: BASES.length });
    }
    if (canon === '') {
      const rows = CAMPAIGNS.map(([label, a]) =>
        `<li><strong>${label}:</strong> <a href="/${a}">/${a}</a></li>`).join('\n');
      return new Response(
        `<!doctype html><title>Marquee Links</title><h1>MARQUEE — Link Hub</h1><ul>${rows}</ul><p>Links work in any case. Per-board variants: /plasma800-fl120584</p>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const hit = resolve(canon);
    if (!hit) {
      return new Response('<!doctype html><title>Not found</title><h1>404 — that link is not one of ours.</h1>',
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const rec = {
      ts: new Date().toISOString(),
      alias_raw: rawPath.replace(/^\/+|\/+$/g, ''),
      alias_canonical: hit.tag ? `${hit.alias}-${hit.tag}` : hit.alias,
      placement_tag: hit.tag,
      target: hit.target,
      referer: request.headers.get('referer'),
      ua_family: uaFamily(request.headers.get('user-agent')),
    };
    console.log(JSON.stringify(rec));
    if (env && env.STATS) {
      const key = `hits:${rec.alias_canonical}:${rec.ts.slice(0, 10)}`;
      ctx.waitUntil((async () => {
        const n = parseInt((await env.STATS.get(key)) || '0', 10);
        await env.STATS.put(key, String(n + 1));
      })());
    }
    return new Response(null, { status: 302, headers: { Location: hit.target, 'Cache-Control': 'no-store' } });
  },
};
