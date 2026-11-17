<script setup lang="ts">
import type { CookieRow } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// The Application panel of a Web fundamentals level (chapter 2; docs/features/ui.md, "Web fundamentals play page"):
// what the browser keeps for the page, like Chrome's Application panel. Storage kinds on the left as they arrive
// (Cookies now; the cache comes with chapter 4), the chosen one on the right. Cookies: per site a table with Chrome's
// columns (name, value, domain, path, expires, size, HttpOnly, Secure, SameSite), then the cookies the browser refused
// in this load with Chrome's reason (or, for document.cookie, Grindstone's). Live: the frame posts the jar after each
// change. Everything is text; a narrow panel scrolls a table sideways inside its own region, never the page.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { cookieJar, predicting } = props.play

/** The storage kinds the panel shows (a list, so chapter 4's cache can join it). */
const KINDS = ['cookies'] as const
type Kind = typeof KINDS[number]
const kind = ref<Kind>('cookies')

const start = useTemplateRef<HTMLElement>('start')
defineExpose({ focus: () => start.value?.focus() })

/** A cookie's site: its domain's last two labels (the registrable domain, as the cookie model reads it). */
const siteOf = (domain: string) => domain.split('.').slice(-2).join('.')

const groups = computed(() => {
  const jar = cookieJar.value?.jar ?? []
  const bySite = new Map<string, CookieRow[]>()
  for (const cookie of jar) bySite.set(siteOf(cookie.domain), [...(bySite.get(siteOf(cookie.domain)) ?? []), cookie])
  return [...bySite.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([site, cookies]) => ({ site, cookies }))
})
const refused = computed(() => cookieJar.value?.refused ?? [])
const dropped = computed(() => Math.max(0, (cookieJar.value?.total ?? 0) - (cookieJar.value?.jar.length ?? 0)))

/** Chrome's Domain column: a domain cookie with its leading dot, a host-only one as its host. */
const domainOf = (cookie: CookieRow) => cookie.hostOnly ? cookie.domain : `.${cookie.domain}`
const expiresOf = (cookie: CookieRow) => cookie.expires === null ? t('web.application.session') : new Date(cookie.expires).toISOString()
</script>

<template>
  <section
    :aria-label="t('web.application.label')"
    class="@container flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex items-center gap-1.5 border-b border-(--app-terminal-border) px-3 py-1 text-xs text-muted">
      <UIcon
        name="i-lucide-database"
        class="size-4 shrink-0"
      />
      {{ t('web.application.label') }}
      <span
        v-if="cookieJar"
        class="font-mono text-dimmed tabular-nums"
        data-testid="application-count"
      >{{ t('web.application.count', cookieJar.total) }}</span>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto @lg:grid @lg:grid-cols-[9rem_minmax(0,1fr)] @lg:overflow-hidden">
      <!-- the storage kinds: a list that grows with the chapters -->
      <nav
        :aria-label="t('web.application.kinds')"
        class="border-b border-(--app-terminal-border) px-2 py-1.5 @lg:border-e @lg:border-b-0"
      >
        <ul class="flex gap-1 @lg:flex-col">
          <li
            v-for="name in KINDS"
            :key="name"
          >
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-start text-xs focus-visible:outline-2 focus-visible:outline-primary"
              :class="kind === name ? 'bg-accented font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
              :aria-current="kind === name ? 'page' : undefined"
              @click="kind = name"
            >
              <UIcon
                name="i-lucide-cookie"
                class="size-3.5 shrink-0"
              />
              {{ t(`web.application.kind.${name}`) }}
            </button>
          </li>
        </ul>
      </nav>

      <div
        ref="start"
        tabindex="-1"
        class="min-w-0 px-3 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary @lg:min-h-0 @lg:overflow-y-auto"
        data-testid="application"
      >
        <p
          v-if="!cookieJar"
          class="text-xs text-dimmed"
        >
          {{ predicting ? t('web.server.waiting') : t('web.application.loading') }}
        </p>
        <template v-else>
          <p
            v-if="!groups.length"
            class="text-xs text-dimmed"
            data-testid="application-empty"
          >
            {{ t('web.application.empty') }}
          </p>
          <section
            v-for="group in groups"
            :key="group.site"
            class="mb-3"
            :aria-labelledby="`cookies-${group.site}`"
            data-testid="application-site"
          >
            <h3
              :id="`cookies-${group.site}`"
              class="mb-1 font-mono text-xs font-medium text-highlighted"
            >
              {{ group.site }}
            </h3>
            <!-- a wide table scrolls sideways inside this region, never the page (relative: the sr-only texts in it are
                 absolutely placed, and would push the page wider from outside the scroller) -->
            <div
              role="region"
              tabindex="0"
              :aria-label="t('web.application.tableOf', { site: group.site })"
              class="relative overflow-x-auto rounded-md border border-(--app-terminal-border) focus-visible:outline-2 focus-visible:outline-primary"
            >
              <table class="w-full min-w-[40rem] border-collapse font-mono text-xs">
                <caption class="sr-only">
                  {{ t('web.application.caption', { site: group.site, n: group.cookies.length }) }}
                </caption>
                <thead class="bg-elevated/60 text-start text-muted">
                  <tr>
                    <th
                      v-for="column in ['name', 'value', 'domain', 'path', 'expires', 'size', 'httpOnly', 'secure', 'sameSite']"
                      :key="column"
                      scope="col"
                      class="px-2 py-1 text-start font-sans font-medium whitespace-nowrap"
                    >
                      {{ t(`web.application.column.${column}`) }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="cookie in group.cookies"
                    :key="`${cookie.domain} ${cookie.path} ${cookie.name}`"
                    class="border-t border-(--app-terminal-border) text-toned"
                    data-testid="application-cookie"
                    :data-name="cookie.name"
                  >
                    <th
                      scope="row"
                      class="px-2 py-1 text-start font-medium whitespace-nowrap text-highlighted"
                    >
                      {{ cookie.name }}
                    </th>
                    <td class="max-w-64 min-w-28 px-2 py-1 break-all">
                      {{ cookie.value }}
                    </td>
                    <td class="px-2 py-1 whitespace-nowrap">
                      {{ domainOf(cookie) }}
                    </td>
                    <td class="px-2 py-1 whitespace-nowrap">
                      {{ cookie.path }}
                    </td>
                    <td class="px-2 py-1 whitespace-nowrap">
                      {{ expiresOf(cookie) }}
                    </td>
                    <td class="px-2 py-1 text-end tabular-nums">
                      {{ cookie.size }}
                    </td>
                    <td
                      class="px-2 py-1 text-center"
                      :data-flag="cookie.httpOnly"
                    >
                      <span aria-hidden="true">{{ cookie.httpOnly ? '✓' : '' }}</span><span class="sr-only">{{ cookie.httpOnly ? t('web.application.yes') : t('web.application.no') }}</span>
                    </td>
                    <td
                      class="px-2 py-1 text-center"
                      :data-flag="cookie.secure"
                    >
                      <span aria-hidden="true">{{ cookie.secure ? '✓' : '' }}</span><span class="sr-only">{{ cookie.secure ? t('web.application.yes') : t('web.application.no') }}</span>
                    </td>
                    <td class="px-2 py-1 whitespace-nowrap">
                      <template v-if="cookie.sameSite === 'Unspecified'">
                        <span class="text-dimmed">{{ t('web.application.unspecified') }}</span>
                      </template>
                      <template v-else>
                        {{ cookie.sameSite }}
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <p
            v-if="dropped"
            class="mb-3 text-xs text-dimmed"
          >
            {{ t('web.application.more', dropped) }}
          </p>

          <section
            v-if="refused.length"
            aria-labelledby="cookies-refused"
            data-testid="application-refused"
          >
            <h3
              id="cookies-refused"
              class="mb-1 text-xs font-medium text-highlighted"
            >
              {{ t('web.application.refused') }}
            </h3>
            <ul class="space-y-1.5">
              <li
                v-for="(row, index) in refused"
                :key="index"
                class="rounded-md border border-error/40 bg-error/10 px-2 py-1.5 text-xs"
                data-testid="application-refused-row"
                :data-name="row.name"
              >
                <p class="font-mono break-all text-highlighted">
                  {{ row.line }}
                </p>
                <p class="text-muted">
                  {{ row.source === 'set' ? t('web.application.fromHeader', { url: row.url }) : t('web.application.fromScript', { url: row.url }) }}
                </p>
                <p class="text-toned">
                  {{ row.reason }}
                </p>
              </li>
            </ul>
          </section>
        </template>
      </div>
    </div>
  </section>
</template>
