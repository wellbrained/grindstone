# i18n layer

Adds [@nuxtjs/i18n](https://i18n.nuxtjs.org) with English and German. Auto-registered because it lives in `layers/`.

- Translations: `i18n/locales/*.json` (this layer). Your app can add or override keys in its own `i18n/locales/` with the same file names.
- `LanguageSwitcher` is a global component; the default layout shows it in the header automatically.
- `app/plugins/i18n-head.ts` keeps `<html lang>` in sync with the active locale.
- Strategy is `no_prefix` (URLs don't change, locale is stored in a cookie). For SEO-friendly `/de/...` URLs, switch to `prefix_except_default` and use `localePath()` / `<NuxtLinkLocale>` for links.
- Example: `/examples/i18n`. Test: `test/unit/locales.spec.ts` checks all locales have the same keys.

Nuxt UI's built-in component texts (e.g. "Close", "No data") have their own locale — pass it to `<UApp :locale>` if you need them translated: https://ui.nuxt.com/docs/getting-started/integrations/i18n/nuxt

## Add a language

1. Add `{ code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' }` to `locales` in `nuxt.config.ts`
2. Create `i18n/locales/fr.json` with the same keys as `en.json`

## Remove

```bash
pnpm remove @nuxtjs/i18n
```

Then delete the `layers/i18n/` folder. Replace any `$t('…')` calls in your own code with plain text.

## Add back to a project

Copy `layers/i18n/` from the template into the project, then:

```bash
pnpm add @nuxtjs/i18n
```
