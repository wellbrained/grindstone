<script setup lang="ts">
import type { A11yKey } from '#shared/levels'
import type { DebuggingPlaySession, ReaderRow } from '~/composables/useDebuggingPlay'
import type { A11yNode } from './WebA11yNode.vue'

// The Accessibility panel of a Web fundamentals chapter 6 level (docs/features/ui.md, "Web fundamentals play page"): the
// keys of the modelled keyboard (they press Tab, Enter, Space and Escape on whatever has focus in the app you see), what
// the screen reader said in this load (where focus went, a dialog it entered, a state or name that changed, what a live
// region announced, Tab leaving the page), each with the key it followed, and the accessibility tree (role, name, value,
// states, description; the focused row marked). Text only; a reload empties it.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { readerRows, clearReader, a11yTree, refreshTree, pressKey, predicting, ready } = props.play

const log = useTemplateRef<HTMLElement>('log')
defineExpose({ focus: () => log.value?.focus() })

// new lines keep the end in view (as a terminal does), unless you scrolled up to read
watch(readerRows, () => {
  const element = log.value
  if (!element) return
  const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 24
  if (atEnd) nextTick(() => element.scrollTo({ top: element.scrollHeight }))
})

const KEYS: readonly A11yKey[] = ['Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape']

/** Where focus is, as the reader would say it. */
const focusText = computed(() => {
  const tree = a11yTree.value
  if (!tree) return predicting.value ? t('web.server.waiting') : t('web.a11y.focusUnknown')
  if (tree.focus === null) return t('web.a11y.focusPage')
  return tree.focus === '' ? t('web.a11y.hiddenFromReader') : tree.focus
})

const TONE: Record<ReaderRow['kind'], string> = {
  focus: 'bg-accented text-highlighted',
  dialog: 'bg-info/15 text-highlighted',
  state: 'bg-success/15 text-highlighted',
  name: 'bg-elevated text-toned ring ring-inset ring-default',
  polite: 'bg-warning/15 text-highlighted',
  assertive: 'bg-error/15 text-highlighted',
  leave: 'bg-elevated text-muted'
}
const keyName = (key: string) => key === 'user' ? t('web.a11y.user') : t(`web.a11y.key.${key}`)
/** What a reader line says: its words, or for Tab leaving the page what happened. */
const saidText = (row: ReaderRow) => row.kind === 'leave' ? t('web.a11y.leftPage') : row.text || t('web.a11y.hiddenFromReader')

/** The tree's rows (depth first, each with its depth) as nested nodes: a nested list a screen reader can follow. */
const nodes = computed<A11yNode[]>(() => {
  const roots: A11yNode[] = []
  const stack: A11yNode[] = []
  for (const row of a11yTree.value?.rows ?? []) {
    const node: A11yNode = { row, children: [] }
    stack.length = Math.min(stack.length, row.depth)
    const parent = stack.at(-1)
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
})
</script>

<template>
  <section
    :aria-label="t('web.a11y.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-(--app-terminal-border) px-3 py-1.5 text-xs text-muted">
      <p class="flex min-w-0 flex-1 basis-48 items-center gap-1.5">
        <UIcon
          name="i-lucide-accessibility"
          class="size-4 shrink-0"
        />
        <span class="shrink-0">{{ t('web.a11y.focus') }}</span>
        <span
          class="min-w-0 truncate font-mono text-highlighted"
          data-testid="a11y-focus"
        >{{ focusText }}</span>
      </p>
      <div
        role="group"
        :aria-label="t('web.a11y.keys')"
        class="flex flex-wrap items-center gap-1"
      >
        <UButton
          v-for="key in KEYS"
          :key="key"
          size="xs"
          color="neutral"
          variant="outline"
          :label="keyName(key)"
          :aria-label="t('web.a11y.press', { key: keyName(key) })"
          :disabled="!ready || predicting"
          :data-testid="`a11y-key-${key}`"
          @click="pressKey(key)"
        />
      </div>
    </header>
    <p class="border-b border-(--app-terminal-border) px-3 py-1 text-xs text-dimmed">
      {{ t('web.a11y.note') }}
    </p>
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-0 flex-1 flex-col border-b border-(--app-terminal-border)">
        <div class="flex items-center justify-between gap-2 px-3 pt-1.5">
          <h3 class="text-xs font-medium text-toned">
            {{ t('web.a11y.reader') }}
          </h3>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-ban"
            :label="t('debugging.console.clear')"
            data-testid="a11y-clear"
            @click="clearReader"
          />
        </div>
        <div
          ref="log"
          role="log"
          tabindex="0"
          :aria-label="t('web.a11y.lines')"
          class="min-h-20 flex-1 overflow-y-auto px-3 py-1 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          data-testid="a11y-log"
        >
          <p
            v-if="!readerRows.length"
            class="text-dimmed"
          >
            {{ predicting ? t('web.server.waiting') : t('web.a11y.silent') }}
          </p>
          <p
            v-for="row in readerRows"
            :key="row.id"
            class="flex items-baseline gap-2 py-0.5"
            :data-kind="row.kind"
            :data-said="row.text"
            data-testid="a11y-line"
          >
            <span
              class="inline-block shrink-0 rounded px-1.5 font-mono text-[11px] leading-5"
              :class="TONE[row.kind]"
            >{{ t(`web.a11y.kind.${row.kind}`) }}</span>
            <span
              class="min-w-0 flex-1 break-words text-highlighted"
              data-testid="a11y-said"
            >{{ saidText(row) }}</span>
            <span
              v-if="row.key"
              class="shrink-0 text-dimmed"
            >{{ t('web.a11y.after', { key: keyName(row.key) }) }}</span>
          </p>
        </div>
      </div>
      <div class="flex min-h-0 flex-[1.4] flex-col">
        <div class="flex items-center justify-between gap-2 px-3 pt-1.5">
          <h3 class="text-xs font-medium text-toned">
            {{ t('web.a11y.tree') }}
          </h3>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            :label="t('web.a11y.refresh')"
            :disabled="!ready || predicting"
            data-testid="a11y-refresh"
            @click="refreshTree"
          />
        </div>
        <div
          role="region"
          tabindex="0"
          :aria-label="t('web.a11y.treeLabel')"
          class="min-h-16 flex-1 overflow-auto px-2 py-1 font-mono text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          data-testid="a11y-tree"
        >
          <p
            v-if="!a11yTree"
            class="px-1 font-sans text-dimmed"
          >
            {{ predicting ? t('web.server.waiting') : t('web.a11y.treeEmpty') }}
          </p>
          <ul v-else>
            <WebA11yNode
              v-for="(node, index) in nodes"
              :key="index"
              :node="node"
            />
          </ul>
          <p
            v-if="a11yTree?.truncated"
            class="px-1 font-sans text-dimmed"
          >
            {{ t('web.a11y.truncated') }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
