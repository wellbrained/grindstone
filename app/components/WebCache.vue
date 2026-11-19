<script setup lang="ts">
import type { CacheMessage, CacheRow, CdnLogRow } from '#shared/levels'

// The Application panel's Cache (Web fundamentals chapter 4; docs/features/ui.md, "Web fundamentals play page"): what
// Lena's browser keeps of the API's answers, and with a CDN in front of the API what the CDN keeps and what it did with
// every request (who asked, HIT, MISS, REVALIDATED or PASS, and why). Each copy with its address, what its Vary keeps it
// for, its status, when it arrived, its age, how long it stays fresh, its Cache-Control and ETag, and how often it was
// used. Times on the scripted clock. Everything is text; a wide table scrolls inside its own region.
const props = defineProps<{ cache: CacheMessage | null, predicting: boolean }>()

const { t } = useI18n()

const API = 'https://api.cornerbakery.shop'
/** An address as the tables show it: the path on the API, the whole address anywhere else. */
const short = (url: string) => url.startsWith(`${API}/`) ? url.slice(API.length) : url
/** A scripted moment as the clock on the wall reads it (UTC, the clock's zone). */
const clock = (at: number) => new Date(at).toISOString().slice(11, 19)
/** How long a copy stays fresh, or that it is stale, or checked every time. */
const freshness = (row: CacheRow) => {
  if (row.lifetime === -1) return t('web.cache.forever')
  if (row.lifetime === 0) return t('web.cache.always')
  return row.fresh ? t('web.cache.freshFor', { time: span(row.lifetime - row.age) }) : t('web.cache.stale', { time: span(row.age - row.lifetime) })
}
/** A number of seconds as minutes and seconds (hours past an hour). */
const span = (seconds: number) => {
  if (seconds >= 3600) return t('web.cache.hours', { h: Math.floor(seconds / 3600), m: Math.floor((seconds % 3600) / 60) })
  if (seconds >= 60) return t('web.cache.minutes', { m: Math.floor(seconds / 60), s: seconds % 60 })
  return t('web.cache.seconds', { s: seconds })
}

const tables = computed(() => {
  const cache = props.cache
  if (!cache) return []
  return [
    { id: 'browser', title: t('web.cache.browser'), note: t('web.cache.browserNote'), rows: cache.browser, shared: false },
    ...(cache.cdn ? [{ id: 'cdn', title: t('web.cache.cdn'), note: t('web.cache.cdnNote'), rows: cache.cdn, shared: true }] : [])
  ]
})
const log = computed<CdnLogRow[]>(() => props.cache?.cdn ? props.cache.log : [])
const OUTCOME_TONE: Record<CdnLogRow['outcome'], string> = {
  HIT: 'bg-success/15 text-highlighted',
  REVALIDATED: 'bg-info/15 text-highlighted',
  MISS: 'bg-accented text-toned',
  PASS: 'bg-warning/15 text-highlighted'
}
</script>

<template>
  <div data-testid="application-cache">
    <p
      v-if="!cache"
      class="text-xs text-dimmed"
    >
      {{ predicting ? t('web.server.waiting') : t('web.cache.loading') }}
    </p>
    <template v-else>
      <section
        v-for="table in tables"
        :key="table.id"
        class="mb-3"
        :aria-labelledby="`cache-${table.id}`"
        data-testid="cache-table"
        :data-cache="table.id"
      >
        <h3
          :id="`cache-${table.id}`"
          class="text-xs font-medium text-highlighted"
        >
          {{ table.title }}
        </h3>
        <p class="mb-1 text-xs text-muted">
          {{ table.note }}
        </p>
        <p
          v-if="!table.rows.length"
          class="text-xs text-dimmed"
          data-testid="cache-empty"
        >
          {{ t('web.cache.empty') }}
        </p>
        <div
          v-else
          role="region"
          tabindex="0"
          :aria-label="t('web.cache.tableOf', { cache: table.title })"
          class="relative overflow-x-auto rounded-md border border-(--app-terminal-border) focus-visible:outline-2 focus-visible:outline-primary"
        >
          <table class="w-full min-w-[44rem] border-collapse font-mono text-xs">
            <caption class="sr-only">
              {{ t('web.cache.caption', { cache: table.title, n: table.rows.length }) }}
            </caption>
            <thead class="bg-elevated/60 text-start text-muted">
              <tr>
                <th
                  v-for="column in table.shared ? ['address', 'vary', 'by', 'status', 'stored', 'age', 'fresh', 'control', 'etag', 'hits'] : ['address', 'status', 'stored', 'age', 'fresh', 'control', 'etag', 'hits']"
                  :key="column"
                  scope="col"
                  class="px-2 py-1 text-start font-sans font-medium whitespace-nowrap"
                >
                  {{ t(`web.cache.column.${column}`) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in table.rows"
                :key="`${row.url} ${row.vary} ${row.stored}`"
                class="border-t border-(--app-terminal-border) text-toned"
                data-testid="cache-row"
                :data-url="row.url"
                :data-fresh="row.fresh"
              >
                <th
                  scope="row"
                  class="px-2 py-1 text-start font-medium break-all text-highlighted"
                >
                  {{ short(row.url) }}
                </th>
                <td
                  v-if="table.shared"
                  class="px-2 py-1 break-all"
                >
                  {{ row.vary || t('web.cache.anyone') }}
                </td>
                <td
                  v-if="table.shared"
                  class="px-2 py-1 whitespace-nowrap"
                >
                  {{ row.by }}
                </td>
                <td class="px-2 py-1 tabular-nums">
                  {{ row.status }}
                </td>
                <td class="px-2 py-1 tabular-nums">
                  {{ clock(row.stored) }}
                </td>
                <td class="px-2 py-1 whitespace-nowrap tabular-nums">
                  {{ span(row.age) }}
                </td>
                <td
                  class="px-2 py-1 whitespace-nowrap"
                  :class="row.fresh ? 'text-success' : 'text-muted'"
                >
                  {{ freshness(row) }}
                </td>
                <td class="max-w-56 min-w-28 px-2 py-1 break-all">
                  {{ row.control || t('web.cache.none') }}
                </td>
                <td class="max-w-56 min-w-24 px-2 py-1 break-all">
                  {{ row.etag || t('web.cache.none') }}
                </td>
                <td class="px-2 py-1 text-end tabular-nums">
                  {{ row.hits }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        v-if="cache.cdn"
        aria-labelledby="cache-log"
        data-testid="cdn-log"
      >
        <h3
          id="cache-log"
          class="text-xs font-medium text-highlighted"
        >
          {{ t('web.cache.log') }}
        </h3>
        <p
          v-if="!log.length"
          class="text-xs text-dimmed"
        >
          {{ t('web.cache.logEmpty') }}
        </p>
        <ol
          v-else
          class="mt-1 space-y-1"
        >
          <li
            v-for="(line, index) in log"
            :key="index"
            class="rounded-md border border-(--app-terminal-border) px-2 py-1 text-xs"
            data-testid="cdn-line"
            :data-outcome="line.outcome"
            :data-who="line.who"
          >
            <p class="font-mono break-all text-toned">
              <span class="text-dimmed tabular-nums">{{ clock(line.at) }}</span>{{ ' ' }}<span class="font-sans font-medium text-highlighted">{{ line.who }}</span>{{ ' ' }}{{ line.method }} {{ short(line.url) }}{{ ' ' }}<span
                class="rounded-sm px-1 font-sans text-[11px]"
                :class="OUTCOME_TONE[line.outcome]"
              >{{ line.outcome }}</span>{{ ' ' }}<span class="tabular-nums">{{ line.status ?? t('web.server.noAnswer') }}</span><template v-if="line.age !== null">
                {{ ' ' }}<span class="text-muted">{{ t('web.cache.agedLine', { time: span(line.age) }) }}</span>
              </template>
            </p>
            <p
              v-if="line.note"
              class="text-muted"
            >
              {{ line.note }}
            </p>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
