<script setup lang="ts">
import { SHOP_ORIGIN } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// Debugging's App panel (docs/features/ui.md, "Sandbox and bridge"): a slim address bar, Reload, and the level's app in
// a sealed iframe (sandbox="allow-scripts" only: an opaque origin, so it can't read Grindstone's storage, cookies or
// DOM). Only messages from this iframe reach the play page, which still checks each one (its load's token, its shape).
// In levels with the Elements panel the header shows the app's width (media queries hold by it), and pick mode says
// what the next click does.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { level, load, checking, stale, hasNetwork, hasElements, picking, setPicking, reloadApp, onFrameMessage, connectFrame } = props.play

const frame = useTemplateRef<HTMLIFrameElement>('frame')
connectFrame(() => frame.value?.contentWindow ?? null)

const { width } = useElementSize(frame)

// Escape stops pick mode from anywhere on the page (inside the app, the bridge stops it itself)
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (picking.value && event.key === 'Escape') setPicking(false)
})

useEventListener(window, 'message', (event: MessageEvent) => {
  if (frame.value && event.source === frame.value.contentWindow) onFrameMessage(event.data)
})

const address = `${SHOP_ORIGIN.replace(/^https:\/\//, '').replace(/\/$/, '')}${level.sandbox.page}`
</script>

<template>
  <section
    :aria-label="t('debugging.app.label')"
    class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal)"
  >
    <header class="flex items-center gap-2 border-b border-(--app-terminal-border) bg-elevated px-2 py-1.5">
      <span class="ps-1 font-mono text-xs text-highlighted">{{ t('debugging.panel.app') }}</span>
      <p
        class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-(--app-terminal) px-2.5 py-1 font-mono text-xs text-muted"
        :aria-label="t('debugging.app.address', { address })"
      >
        <UIcon
          name="i-lucide-lock"
          class="size-3 shrink-0 text-dimmed"
        />
        <span
          class="truncate"
          aria-hidden="true"
        >{{ address }}</span>
      </p>
      <p
        v-if="hasElements && width"
        class="shrink-0 font-mono text-xs text-dimmed tabular-nums"
        data-testid="app-width"
      >
        <span aria-hidden="true">{{ Math.round(width) }} px</span><span class="sr-only">{{ t('debugging.app.width', { n: Math.round(width) }) }}</span>
      </p>
      <UButton
        size="xs"
        color="neutral"
        icon="i-lucide-rotate-cw"
        :label="t('debugging.app.reload')"
        :loading="checking"
        data-testid="reload"
        @click="reloadApp"
      />
    </header>
    <p
      v-if="picking"
      role="status"
      class="flex items-center justify-between gap-2 border-b border-(--app-terminal-border) bg-primary/10 px-3 py-1 text-xs text-highlighted"
      data-testid="pick-banner"
    >
      <span class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-mouse-pointer-2"
          class="size-3.5 shrink-0 text-primary"
        />
        {{ t('debugging.app.picking') }}
      </span>
      <UButton
        size="xs"
        color="neutral"
        :label="t('debugging.app.stopPicking')"
        @click="setPicking(false)"
      />
    </p>
    <p
      v-if="stale && !checking"
      class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1 text-xs text-highlighted"
      data-testid="stale"
    >
      {{ t('debugging.app.stale') }}
    </p>
    <!-- a new iframe per load: nothing of an old load (history, timers) carries over. The app is as wide as a phone at
         every window size (at most 26rem, 416px, centred), so its media
         queries behave the same wherever you play -->
    <div class="flex min-h-0 flex-1 justify-center bg-elevated">
      <iframe
        v-if="load"
        ref="frame"
        :key="load.token"
        sandbox="allow-scripts"
        referrerpolicy="no-referrer"
        :srcdoc="load.html"
        :title="t('debugging.app.frame')"
        class="h-full min-h-0 w-full max-w-[26rem] border-0"
        data-testid="app-frame"
      />
    </div>
    <p class="border-t border-(--app-terminal-border) px-3 py-1.5 text-xs text-dimmed">
      {{ hasNetwork ? t('debugging.app.sealedBackend') : t('debugging.app.sealed') }}
    </p>
  </section>
</template>
