<script setup lang="ts">
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// Debugging's Code panel (docs/features/ui.md, "Debugging play page"): a tab per file of the app, Save, and the editor.
// A line opened from the Console is marked and scrolled into view. A find task is read-only: a click on a line (or
// Enter on the cursor's line) is the answer.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { store, files, unsaved, find, mark, save, openFile, pick } = props.play

const active = computed(() => store.value.active)
const draft = computed({
  get: () => store.value.drafts[active.value] ?? '',
  set: (text: string) => {
    store.value.drafts[active.value] = text
    // an edit in the marked file makes its line number stale: drop the mark so coming back never jumps to the old line
    if (mark.value?.path === active.value) mark.value = null
  }
})
// only the open file's mark; a new object per mark, so the same line opened again scrolls to it again
const activeMark = computed(() => mark.value && mark.value.path === active.value ? { line: mark.value.line, tone: mark.value.tone } : null)

const tabs = useTemplateRef<HTMLElement>('tabs')

/** Arrow keys move along the file tabs, Home and End jump to the ends. */
function onTabKey(event: KeyboardEvent) {
  const list = files.value
  const index = list.indexOf(active.value)
  const to = event.key === 'ArrowRight'
    ? (index + 1) % list.length
    : event.key === 'ArrowLeft' ? (index - 1 + list.length) % list.length : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1
  if (to < 0) return
  event.preventDefault()
  openFile(list[to]!)
  nextTick(() => tabs.value?.querySelector<HTMLElement>(`[data-file="${CSS.escape(list[to]!)}"]`)?.focus())
}
</script>

<template>
  <section
    :aria-label="t('debugging.code.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal)"
  >
    <header class="flex min-h-9 items-stretch border-b border-(--app-terminal-border) bg-elevated">
      <div
        ref="tabs"
        role="tablist"
        :aria-label="t('debugging.code.files')"
        class="flex min-w-0 flex-1 items-stretch overflow-x-auto"
        @keydown="onTabKey"
      >
        <button
          v-for="path in files"
          :key="path"
          type="button"
          role="tab"
          :aria-selected="path === active"
          aria-controls="debugging-editor"
          :tabindex="path === active ? 0 : -1"
          :data-file="path"
          class="flex shrink-0 items-center gap-1.5 border-r border-(--app-terminal-border) px-3 py-1.5 font-mono text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          :class="path === active ? 'bg-(--app-terminal) text-highlighted shadow-[inset_0_-2px_0_var(--ui-primary)]' : 'text-muted hover:bg-accented hover:text-highlighted'"
          @click="openFile(path)"
        >
          {{ path }}
          <span
            v-if="unsaved.includes(path)"
            aria-hidden="true"
            class="text-primary"
          >●</span>
          <span
            v-if="unsaved.includes(path)"
            class="sr-only"
          >({{ t('debugging.code.unsaved') }})</span>
        </button>
      </div>
      <div class="flex shrink-0 items-center gap-1 px-1.5">
        <span
          v-if="find"
          class="flex items-center gap-1.5 px-1.5 text-xs text-muted"
        >
          <UIcon
            name="i-lucide-mouse-pointer-click"
            class="size-3.5"
          />
          <span class="max-sm:sr-only">{{ t('debugging.code.pickNote') }}</span>
        </span>
        <UButton
          v-else
          size="xs"
          color="primary"
          icon="i-lucide-save"
          :label="t('editor.save')"
          :disabled="!unsaved.includes(active)"
          :title="t('editor.saveKeys')"
          data-testid="save-file"
          @click="save()"
        />
      </div>
    </header>
    <div
      id="debugging-editor"
      role="tabpanel"
      class="min-h-0 flex-1"
      :data-path="active"
    >
      <LazyCodeEditor
        v-model="draft"
        :path="active"
        :read-only="!!find"
        :pickable="!!find"
        :mark="activeMark"
        @save="save()"
        @pick="line => pick({ path: active, line })"
      />
    </div>
  </section>
</template>
