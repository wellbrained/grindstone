<script setup lang="ts">
import type { CheatShownCard } from '~/utils/cheat-sheet'

// One card of the Debugging or Web fundamentals cheat sheet (docs/features/ui.md, "Debugging cheat sheet"): the heading,
// a one-line rule, the example lines (click one to copy it), the longer text behind a disclosure, and the levels that
// practise it. A native <details>: reachable by keyboard, found by the browser's find-in-page, no script of its own.
const props = defineProps<{
  card: CheatShownCard
  /** The sheet's i18n prefix (`debugCheat`, `webCheat`) for the texts both sheets word the same way. */
  prefix: string
}>()

const { t } = useI18n()

const copied = ref<string | null>(null)
async function copy(line: string) {
  try {
    await navigator.clipboard.writeText(line)
    copied.value = line
    setTimeout(() => {
      if (copied.value === line) copied.value = null
    }, 1500)
  } catch {
    // clipboard blocked: nothing to do, the line is still selectable
  }
}

// The filter opens the disclosure when it found the card only in its text, and closes it again when the filter no
// longer needs it; a disclosure the visitor opened or closed themselves is left as they set it.
const open = ref(props.card.reveal)
let revealed = props.card.reveal
watch(() => props.card.reveal, (reveal) => {
  if (reveal && !open.value) {
    open.value = true
    revealed = true
  } else if (!reveal && revealed) {
    open.value = false
    revealed = false
  }
})

function onToggle(event: Event) {
  const isOpen = (event.target as HTMLDetailsElement).open
  // the toggle event also follows our own change: only a difference is the visitor's doing
  if (isOpen === open.value) return
  open.value = isOpen
  revealed = false
}
</script>

<template>
  <li
    class="rounded-lg border border-default bg-elevated p-5"
    :data-entry="card.id"
    data-testid="cheat-card"
  >
    <h3
      v-if="card.message"
      class="font-mono text-sm leading-snug font-semibold text-highlighted wrap-break-word"
    >
      <span
        class="me-2 text-muted"
        aria-hidden="true"
      >!</span>{{ card.title }}
    </h3>
    <h3
      v-else
      class="text-base leading-snug font-semibold tracking-tight text-highlighted"
    >
      {{ card.title }}
    </h3>
    <p
      class="mt-1.5 text-sm text-toned"
      data-testid="cheat-rule"
    >
      {{ card.rule }}
    </p>

    <!-- a small console: each example as a "# what it does" comment above its line; click a line to copy it, a key or a status word is plain -->
    <ul
      v-if="card.examples.length"
      class="mt-3 space-y-1 rounded-r-lg border-l-2 border-accented bg-(--app-terminal) py-2 font-mono text-sm"
    >
      <li
        v-for="example in card.examples"
        :key="example.line"
      >
        <button
          v-if="example.copy"
          type="button"
          class="group flex w-full cursor-pointer items-start gap-2 px-3 py-1 text-left hover:bg-elevated/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          :aria-label="t(`${prefix}.copy`, { line: example.line })"
          data-testid="cheat-example"
          @click="copy(example.line)"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-xs text-muted"># {{ example.note }}</span>
            <span class="block text-highlighted wrap-break-word"><span
              class="mr-2 text-dimmed"
              aria-hidden="true"
            >›</span>{{ example.line }}</span>
          </span>
          <!-- always there (no hover on a phone): the line is a button -->
          <UIcon
            :name="copied === example.line ? 'i-lucide-check' : 'i-lucide-copy'"
            class="mt-5 size-3.5 shrink-0"
            :class="copied === example.line ? 'text-success' : 'text-muted group-hover:text-highlighted group-focus-visible:text-highlighted'"
          />
        </button>
        <div
          v-else
          class="px-3 py-1"
        >
          <span class="block text-xs text-muted"># {{ example.note }}</span>
          <span class="block text-highlighted wrap-break-word">{{ example.line }}</span>
        </div>
      </li>
    </ul>

    <details
      class="group/details mt-3"
      :open="open"
      data-testid="cheat-details"
      @toggle="onToggle"
    >
      <summary class="flex min-h-6 w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-sm text-muted hover:text-highlighted pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 shrink-0 motion-safe:transition-transform group-open/details:rotate-90"
          aria-hidden="true"
        />{{ card.detailsLabel }}
      </summary>
      <p class="mt-1.5 text-sm text-toned">
        {{ card.details }}
      </p>
    </details>

    <CheatLevelLinks
      :levels="card.levels"
      :label="t(`${prefix}.practise`)"
    />
  </li>
</template>
