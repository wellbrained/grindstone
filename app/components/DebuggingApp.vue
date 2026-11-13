<script setup lang="ts">
import { SHOP_ORIGIN } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// Debugging's App panel (docs/features/ui.md, "Sandbox and bridge"): a slim address bar, Reload, and the level's app in
// a sealed iframe (sandbox="allow-scripts" only: an opaque origin, so it can't read Grindstone's storage, cookies or
// DOM). Only messages from this iframe reach the play page, which still checks each one (its load's token, its shape).
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { level, load, checking, stale, reloadApp, onFrameMessage, connectFrame } = props.play

const frame = useTemplateRef<HTMLIFrameElement>('frame')
connectFrame(() => frame.value?.contentWindow ?? null)

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
      v-if="stale && !checking"
      class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1 text-xs text-highlighted"
      data-testid="stale"
    >
      {{ t('debugging.app.stale') }}
    </p>
    <!-- a new iframe per load: nothing of an old load (history, timers) carries over -->
    <iframe
      v-if="load"
      ref="frame"
      :key="load.token"
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      :srcdoc="load.html"
      :title="t('debugging.app.frame')"
      class="min-h-0 w-full flex-1 border-0"
      data-testid="app-frame"
    />
    <p class="border-t border-(--app-terminal-border) px-3 py-1.5 text-xs text-dimmed">
      {{ t('debugging.app.sealed') }}
    </p>
  </section>
</template>
