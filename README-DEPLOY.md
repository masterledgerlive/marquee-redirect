# MARQUEE Redirect Layer — Deploy README

Case-insensitive short links with our own per-hit stats. Zero-dependency Node
core (`app.js` + `aliases.json`) plus a Cloudflare Worker variant (`worker.js`)
carrying identical alias logic.

- `GET /<alias>` → **302** to the target (302, not 301: browsers permanently
  cache 301s, and a cached redirect never reaches our stats again).
- Aliases match in **any case**; trailing slashes are trimmed.
- Per-board variants: `/<base>-<tag>` (e.g. `/plasma800-fl120584`) redirect to
  the base target and log the placement tag.
- Every hit appends one JSON line to the stats log (Node) or emits one
  structured log line (Worker).
- `/health` → `{"ok":true,...}` · `/` → link-hub index · unknown → 404.

## Path A — Railway (access already connected; recommended first deploy)
1. Create a new Railway project (or reuse an existing one) and add a service
   whose root directory is this folder. Railway detects `package.json`;
   start command is `node app.js` (also in `Procfile`). No dependencies to
   install. Railway injects `PORT` automatically.
2. Stats persistence: the local stats file lives on ephemeral disk. Attach a
   Railway **volume** mounted at the app directory (or set `STATS_FILE` to a
   path on the volume) so `stats.log` survives deploys — or accept
   log-stream-only stats for v1 and rotate the file down nightly.
3. Generate a public domain (service → Settings → Networking → Generate
   Domain) → `https://<service>.up.railway.app/<alias>`.
4. Cost honesty (checked 2026-10-20): Railway has a $0 Free plan with $1/mo of
   usage credit and small limits (1 vCPU / 0.5 GB, 1 replica) — this app idles
   at near-zero, so it can start at $0; sustained always-on use may exceed the
   Free credit, in which case Hobby is $5/mo including $5 usage. **Any plan
   change is David's call — nothing here authorizes spend.**
5. Custom domain later (e.g. a subdomain of a domain David controls): add it
   in Railway networking settings + one CNAME at the DNS host. NOTE: GoDaddy
   API access returned 401 in the 2026-10-20 survey, so DNS control via the
   connector is unverified — fix/reconnect that credential first if GoDaddy is
   the DNS host.

## Path B — Cloudflare Workers (free tier, needs a Cloudflare account)
1. Install wrangler (`npm i -g wrangler`), `wrangler login` with David's
   Cloudflare account (no Cloudflare account/tooling exists on this VM yet —
   this sign-in is the parent's step).
2. From this folder: `wrangler deploy` → live at
   `https://marquee-redirect.<account>.workers.dev/<alias>`.
3. Free plan (checked 2026-10-20, official limits page): 100,000 requests/day
   on workers.dev — far beyond billboard click volume; 10 ms CPU/request is
   ample for a lookup + redirect.
4. Stats: structured `console.log` lines appear in Workers Logs (3-day
   retention on Free). For durable counts, create a KV namespace
   (`wrangler kv namespace create STATS`), paste its id into `wrangler.toml`,
   redeploy — worker.js then keeps per-alias daily counters.
5. Custom domain: Workers custom domains require the domain on Cloudflare DNS
   (free plan supports workers.dev only for the subdomain route above; a
   custom domain needs the zone in the same Cloudflare account).

## Changing targets
- Non-Muse aliases: edit `aliases.json` (Node) **and** the `REGISTRY` map in
  `worker.js` — keep them in sync.
- Muse aliases (musebud / billiontokens / bud12l): change `MUSE_TARGET` at the
  top of `app.js` and `worker.js`. Current value is the live Muse hub page
  (shows code BUD12L); fallback is `https://muse.ai/join`.

## Local run / retest
```
PORT=8377 node app.js &
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8377/BLIP50
tail stats.log
```
