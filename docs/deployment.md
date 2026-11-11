# Deployment

Static files on the Hetzner server `app-production`, served by Caddy at https://grindstone.dkiessling.de. No Node service, no port.

- **Deploy**: `scripts/Deploy-Grindstone.ps1` on the PC. Needs a clean, committed checkout; runs `pnpm generate`, uploads `.output/public` over Tailscale SSH and runs `deploy/activate-static.sh` on the server, which unpacks into `/srv/grindstone/releases/<UTC time>-<commit>`, switches `/srv/grindstone/current`, checks `/` and a level page, and goes back to the previous release if either fails. The newest 5 releases are kept.
- **Route**: `/etc/caddy/grindstone.caddy` (copy of `deploy/grindstone.caddy`), imported at the end of `/etc/caddy/Caddyfile`. `try_files ... /200.html` makes direct level links work (SPA). HTML is `no-cache`, `/_nuxt/*` is immutable. Routing backup from the first setup: `/etc/caddy/Caddyfile.before-grindstone-<time>`.
- **DNS**: Hetzner zone `dkiessling.de` (Cloud API zone 1629686): `grindstone` A `167.233.235.154`, AAAA `2a01:4f8:c013:d350::1`, TTL 300, public (not the tailnet IP). Certificates: Caddy, automatic.
- **Versions**: every deployed change bumps the patch version in `package.json`.
- **Rollback by hand**: `ln -sfn /srv/grindstone/releases/<older> /srv/grindstone/current` on the server.
