# Analytics

Self-hosted [Umami](https://umami.is) v3.5.0 on the Hetzner server (ADR 0001: "self-hosted Umami (cookieless)").

- **Tracker**: `https://stats.dkiessling.de/script.js`, loaded from `nuxt.config.ts` (`app.head.script`) with `data-domains="grindstone.dkiessling.de"`, so dev, previews and tests send nothing, and `data-do-not-track="true"`: a browser that sends Do Not Track (`navigator.doNotTrack`) is not counted (Umami's tracker checks DNT only, not Global Privacy Control). The public host serves only `/script.js` and `/api/send`; everything else answers 404.
- **Dashboard**: `https://umami.dkiessling.de`, tailnet only (Caddy `private_tls`, DNS A record on the tailnet IP), behind the CoreHub login (`forward_auth` to CoreHub's `/api/auth/gate`, like the CoreHub-hosted sites). Website "Grindstone", id `ce3b559e-bed9-4d11-826b-85aa0c5eae7d`.
- **Sign-in**: there is no separate Umami password to remember. After the CoreHub login, `/sso` (`/srv/umami/sso.mjs`, systemd `umami-sso.service`, port 3011) logs into Umami with the admin password stored in `/etc/umami/sso.env` (random, 40 characters, root:umami 640) and puts the token where Umami's login would (`localStorage["umami.auth"]`). Caddy sends Umami's own `/login` to `/sso`, so a logout or an expired token signs you in again. The default `admin`/`umami` password was replaced on setup.
- **What is counted**: page views (Umami default: path, referrer, browser, country; no cookies, no IP stored) and three events from `app/utils/analytics.ts`, sent in `useLevelPlay`:
  - `level-start` `{ level }`: the first command in a visit to a level;
  - `hint` `{ level, hint }`: a hint was shown (its number);
  - `level-solved` `{ level, commands, hints }`.
  Nothing a learner types is sent. The About page says so.
- **Server**: user `umami`, app in `/srv/umami/app` (git checkout of the release tag, `pnpm install && pnpm build`), env `/etc/umami/umami.env` (DATABASE_URL, APP_SECRET, PORT 3010, HOSTNAME 127.0.0.1, telemetry off; root:umami 640), systemd `umami.service` (MemoryMax 768M), PostgreSQL 16 (Ubuntu package, local only, database and role `umami`). Caddy routes in `/etc/caddy/umami.caddy`, imported from the Caddyfile.
- **Update**: `cd /srv/umami/app && sudo -u umami git fetch --tags && sudo -u umami git checkout <tag>`, then install and build with the env loaded (as in the first setup) and `systemctl restart umami`.
