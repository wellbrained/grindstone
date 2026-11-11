# Nuxt Template

Starter for new projects: [Nuxt 4](https://nuxt.com), [Nuxt UI 4](https://ui.nuxt.com), Tailwind CSS 4, TypeScript (strict), ESLint, Vitest and a light/dark mode toggle — plus optional Pinia and i18n layers.

## Start a new project from this template

```bash
pnpm dlx giget gh:<your-user>/nuxt_template my-new-app
```

Or use GitHub's **Use this template** button. Then:

1. Set `name` in `package.json`
2. Set `site.name` / `site.description` and the brand colors in `app/app.config.ts`
3. Replace `app/components/AppLogo.vue` and `public/favicon.ico`
4. Copy `.env.example` to `.env` and adjust
5. Remove the layers you don't need (see [Layers](#layers)) and, when you're done learning from them, [the examples](#removing-the-examples)
6. Update or replace `LICENSE` and this README

## Requirements

- Node.js 22+ (`.nvmrc`)
- pnpm — enforced: `npm install` / `yarn` fail with an error. The pinned pnpm version is downloaded automatically.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint         # pnpm lint:fix to auto-fix
pnpm typecheck
pnpm test         # pnpm test:watch for watch mode
pnpm build && pnpm preview
```

## Included

| What | Where to see it |
|---|---|
| Nuxt UI components, icons, color mode, toasts, modals | `/examples/components` |
| Forms with Zod validation | `/examples/form` |
| Server API routes, shared schemas, `useFetch` / `$fetch` | `/examples/api` |
| `useState` composables, `runtimeConfig` / env vars | `/examples/state` |
| Route middleware (auth guard) | `/examples/middleware` |
| Multiple layouts | `/examples/layout` |
| `@nuxt/image` (`NuxtImg`, `NuxtPicture`) | `/examples/image` |
| VueUse composables | `/examples/vueuse` |
| Fonts (`@nuxt/fonts`, opt-in Inter) | `/examples/fonts` |
| Pinia store *(layer)* | `/examples/pinia` |
| i18n translations *(layer)* | `/examples/i18n` |
| PostgreSQL + Drizzle *(layer)* | `/examples/postgres` |
| SQLite + Drizzle *(layer)* | `/examples/sqlite` |

Each example page lists its source files at the top. Tooling: Vitest + `@nuxt/test-utils`, ESLint, CI (lint, typecheck, test, build), Renovate, VS Code settings, `CLAUDE.md`.

## Structure

```
app/
  app.vue                 root: global head/SEO, <UApp>, layout
  app.config.ts           site identity + Nuxt UI theme colors
  assets/css/main.css     Tailwind / Nuxt UI imports, theme tokens (fonts, colors)
  layouts/                default.vue (header/footer), blank.vue
  pages/                  file-based routes (pages/examples/ = demo code)
  components/ composables/ middleware/   auto-imported
  error.vue               404 / error page
server/
  api/                    API routes (file suffix = HTTP method: todos.get.ts, todos.post.ts)
  utils/                  auto-imported server helpers (readZodBody for validated request bodies)
shared/                   code for app AND server (import via #shared/...; shared/types is auto-imported)
layers/                   optional features, auto-registered (pinia, i18n)
test/unit/                plain unit tests (node)
test/nuxt/                tests in a Nuxt environment (components, composables)
```

## Layers

Everything in `layers/` is a [Nuxt layer](https://nuxt.com/docs/getting-started/layers) and is registered automatically. Each layer is self-contained (config, pages, components, tests, README).

| Layer | Adds | Remove |
|---|---|---|
| `layers/pinia` | Pinia stores (`app/stores/`, auto-imported) | `pnpm remove pinia @pinia/nuxt` + delete folder |
| `layers/i18n` | `@nuxtjs/i18n` (en/de), language switcher in the header | `pnpm remove @nuxtjs/i18n` + delete folder |
| `layers/db-postgres` | Drizzle + PostgreSQL (`usePostgres()`); embedded PGlite until `NUXT_POSTGRES_URL` is set | see its README |
| `layers/db-sqlite` | Drizzle + better-sqlite3 (`useSqlite()`), one database file | see its README |

Keep **one** database layer per project. Each has `pnpm db:<postgres|sqlite>:generate | migrate | studio` scripts; migrations are applied automatically on server start.

To add a layer to an existing project: copy its folder and install the packages listed in its README.

## Removing the examples

Delete these when you no longer need them:

- `app/pages/examples/`, `app/components/ExamplePage.vue`, `app/types/page-meta.d.ts`
- `app/composables/useExampleCounter.ts`, `app/composables/useExampleSession.ts`, `app/middleware/example-auth.ts`
- `server/api/examples/`, `server/utils/example-todos.ts`, `shared/schemas/todo.ts`
- `public/images/example.jpg`
- `test/nuxt/useExampleCounter.spec.ts`, `test/unit/todo-schema.spec.ts`
- Layer examples: `layers/*/app/pages/examples/`, `layers/pinia/app/stores/exampleCart.ts` and its test
- The "Examples" entry in `app/layouts/default.vue` and the link in `app/pages/index.vue`
- `exampleSecret` in `nuxt.config.ts` and `.env.example`

## Fonts

The default font is Public Sans. Inter is registered in `nuxt.config.ts` (`fonts.families`) and exposed as the `font-inter` utility in `main.css`. To use it everywhere, set `--font-sans: 'Inter', sans-serif;`.
