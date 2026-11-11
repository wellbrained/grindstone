# Pinia layer

Adds [Pinia](https://pinia.vuejs.org) via `@pinia/nuxt`. Auto-registered because it lives in `layers/`.

- Put stores in `app/stores/` (your app) or `layers/pinia/app/stores/` — both are auto-imported.
- Example: `/examples/pinia` (`app/pages/examples/pinia.vue`, `app/stores/exampleCart.ts`).
- Test: `test/nuxt/exampleCart.spec.ts`.

For simple shared state, `useState` (see `/examples/state`) is often enough — use Pinia when you want devtools, structured actions, or many related stores.

## Remove

```bash
pnpm remove pinia @pinia/nuxt
```

Then delete the `layers/pinia/` folder (and any stores in `app/stores/`).

## Add back to a project

Copy `layers/pinia/` from the template into the project, then:

```bash
pnpm add pinia @pinia/nuxt
```
