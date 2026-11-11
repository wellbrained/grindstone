# Grindstone

Practice real developer skills in short, game-like scenarios. The first track is **Git**: solve levels in a terminal while a commit graph updates live, and keep up with simulated teammates who push to `main` while you work.

Status: in development (v0.1 in progress). Plan: [docs/adr/0001-plan.md](docs/adr/0001-plan.md).

## Why another git trainer?

- **Teammates**: scripted colleagues push, force-push and review while you work, so syncing branches is real.
- **Real situations**: rebasing onto a moved `main`, resolving conflicts, safe force-pushes; later disaster scenarios and workflow tracks.
- **Terminal and graph together**: every command redraws the commit graph.

It runs entirely in the browser on its own simulated git ([why](docs/adr/0002-git-model.md)).

## Development

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm dev        # http://localhost:4003
pnpm lint
pnpm typecheck
pnpm test
pnpm generate   # static build in .output/public
```

Built with Nuxt 4, Vue 3, TypeScript, Nuxt UI and Tailwind CSS.

## License

MIT
