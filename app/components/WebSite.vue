<script setup lang="ts">
import { siteAddress, sitePage, statusLabel, statusTone } from '#shared/levels'
import type { NetworkEntry, OtherSite, StatusTone } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// The Other site panel of a Web fundamentals level (chapter 2; docs/features/ui.md, "Web fundamentals play page"): a
// page on another site that Lena opens while she is signed in at the shop (cheap-flour.example, her webmail), readable
// and never editable. Its HTML is written from the very actions the frame runs (sites.ts), so what you read is what
// happens. Visit as Lena opens it in this load (the level's scene may have done so already); what it made her browser
// send is listed below, each a link to its row in the Network panel. Text only. Several sites: one at a time.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { sites, visitSite, requests, showRequest, predicting, load } = props.play

const chosen = ref(sites[0]?.origin ?? '')
const site = computed<OtherSite | undefined>(() => sites.find(each => each.origin === chosen.value))
/** A site's name: its host, with the scheme only when it is not https (http://cornerbakery.shop is another site). */
const host = (origin: string) => origin.replace(/^https:\/\//, '')
const tabId = (origin: string) => `site-tab-${origin.replace(/[^a-z0-9]+/gi, '-')}`
const lines = computed(() => site.value ? sitePage(site.value).replace(/\n$/, '').split('\n') : [])
/** What this site's page sent in this load. */
const sent = computed(() => requests.value.filter(entry => entry.site === chosen.value))

const visitButton = useTemplateRef<{ $el: HTMLElement }>('visitButton')
const siteList = useTemplateRef<HTMLElement>('siteList')
defineExpose({ focus: () => (siteList.value?.querySelector<HTMLElement>('[aria-selected="true"]') ?? visitButton.value?.$el)?.focus() })

/** Arrow keys move along the sites (they wrap), Home and End jump to the ends. */
function onSiteKey(event: KeyboardEvent) {
  const names = sites.map(each => each.origin)
  const index = names.indexOf(chosen.value)
  const to = event.key === 'ArrowRight' ? (index + 1) % names.length : event.key === 'ArrowLeft' ? (index + names.length - 1) % names.length : event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : -1
  if (to < 0) return
  event.preventDefault()
  chosen.value = names[to]!
  nextTick(() => siteList.value?.querySelector<HTMLElement>(`[data-site="${names[to]}"]`)?.focus())
}

const TONE: Record<StatusTone, string> = { pending: 'text-dimmed', success: 'text-success', neutral: 'text-muted', error: 'text-error' }
const kindOf = (entry: NetworkEntry) => t(`web.network.destination.${entry.destination}`)
const canVisit = computed(() => load.value !== null && !predicting.value)
</script>

<template>
  <section
    :aria-label="t('web.site.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <div
      v-if="sites.length > 1"
      ref="siteList"
      role="tablist"
      :aria-label="t('web.site.sites')"
      class="flex flex-wrap gap-1 border-b border-(--app-terminal-border) p-1"
      @keydown="onSiteKey"
    >
      <button
        v-for="each in sites"
        :id="tabId(each.origin)"
        :key="each.origin"
        type="button"
        role="tab"
        :aria-selected="chosen === each.origin"
        aria-controls="site-panel"
        :tabindex="chosen === each.origin ? 0 : -1"
        :data-site="each.origin"
        class="min-w-0 cursor-pointer rounded-md px-2 py-0.5 font-mono text-xs break-all focus-visible:outline-2 focus-visible:outline-primary"
        :class="chosen === each.origin ? 'bg-accented font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
        @click="chosen = each.origin"
      >
        {{ host(each.origin) }}
      </button>
    </div>
    <!-- the chosen site: a tab panel of the site tabs when there are several -->
    <div
      v-if="site"
      id="site-panel"
      class="flex min-h-0 flex-1 flex-col"
      :role="sites.length > 1 ? 'tabpanel' : undefined"
      :aria-labelledby="sites.length > 1 ? tabId(chosen) : undefined"
      data-testid="site-panel"
    >
      <header class="flex flex-wrap items-center gap-2 border-b border-(--app-terminal-border) bg-elevated px-2 py-1.5">
        <p class="flex min-w-0 flex-1 basis-40 items-center gap-1.5 rounded-md bg-(--app-terminal) px-2.5 py-1 font-mono text-xs text-muted">
          <UIcon
            :name="site.role === 'attacker' ? 'i-lucide-skull' : site.role === 'mail' ? 'i-lucide-mail' : 'i-lucide-globe'"
            class="size-3.5 shrink-0 text-dimmed"
          />
          <span
            class="truncate"
            data-testid="site-address"
          >{{ host(siteAddress(site)) }}</span>
        </p>
        <span class="text-xs text-muted">{{ t(`web.site.role.${site.role}`) }}</span>
        <UButton
          ref="visitButton"
          size="xs"
          color="neutral"
          icon="i-lucide-external-link"
          :label="t('web.site.visit')"
          :disabled="!canVisit"
          :aria-describedby="canVisit ? undefined : 'site-waits'"
          data-testid="site-visit"
          @click="visitSite(site.origin)"
        />
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <p
          v-if="!canVisit"
          id="site-waits"
          class="mb-2 text-xs text-dimmed"
        >
          {{ t('web.server.waiting') }}
        </p>
        <section
          aria-labelledby="site-sent"
          class="mb-3"
        >
          <h3
            id="site-sent"
            class="mb-1 text-xs font-medium text-highlighted"
          >
            {{ t('web.site.sent') }}
          </h3>
          <p
            v-if="!sent.length"
            class="text-xs text-dimmed"
          >
            {{ t('web.site.nothing') }}
          </p>
          <ul
            v-else
            class="space-y-0.5 font-mono text-xs"
            data-testid="site-sent"
          >
            <li
              v-for="entry in sent"
              :key="entry.id"
            >
              <button
                type="button"
                class="flex w-full cursor-pointer flex-wrap items-baseline gap-x-2 rounded-sm px-1 py-0.5 text-start text-toned hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                :aria-label="t('web.site.show', { method: entry.method, url: entry.url, status: statusLabel(entry) })"
                @click="showRequest(entry.id)"
              >
                <span class="text-muted">{{ entry.method }}</span>
                <span class="min-w-0 break-all">{{ entry.url }}</span>
                <span class="font-sans text-[11px] text-dimmed">{{ kindOf(entry) }}</span>
                <span :class="TONE[statusTone(entry)]">{{ statusLabel(entry) }}</span>
              </button>
            </li>
          </ul>
        </section>
        <section aria-labelledby="site-page">
          <h3
            id="site-page"
            class="mb-1 text-xs font-medium text-highlighted"
          >
            {{ t('web.site.page') }}
          </h3>
          <pre
            class="overflow-x-auto rounded-md border border-(--app-terminal-border) bg-elevated/60 px-2 py-1.5 font-mono text-xs leading-5 text-highlighted"
            data-testid="site-page"
          ><span
            v-for="(line, index) in lines"
            :key="index"
            class="block whitespace-pre-wrap break-words"
          ><span
            class="me-3 inline-block w-5 text-end text-dimmed select-none"
            aria-hidden="true"
          >{{ index + 1 }}</span>{{ line }}</span></pre>
        </section>
      </div>
    </div>
  </section>
</template>
