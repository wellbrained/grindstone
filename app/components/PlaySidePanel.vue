<script setup lang="ts">
import type { LevelPlay } from '~/composables/useLevelPlay'

// The level side panel of the IDE and Mix layouts: the level (story, goals, hint and reset) and the commit graph,
// each a collapsible section. `collapsible` adds a button that folds the whole panel into a slim strip (Mix).
const props = defineProps<{
  play: LevelPlay
  number: number
  total: number
  collapsible?: boolean
}>()

const collapsed = defineModel<boolean>('collapsed', { default: false })

const { t } = useI18n()

const { level, session, goals, conflictedFiles, next, graph, hasOrigin, showOrigin, debriefOpen, edit, hint, reset } = props.play

const levelOpen = ref(true)
const graphOpen = ref(true)
const levelId = useId()

const metCount = computed(() => goals.value.filter(goal => goal.met).length)
</script>

<template>
  <aside
    v-if="collapsible && collapsed"
    :aria-label="t('play.panel.label')"
    class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-1.5 lg:h-full lg:flex-col"
  >
    <UButton
      size="sm"
      color="neutral"
      variant="ghost"
      icon="i-lucide-panel-right-open"
      :aria-label="t('play.panel.expand')"
      :aria-expanded="false"
      @click="collapsed = false"
    />
    <p
      class="flex items-center gap-1.5 font-mono text-xs text-muted lg:[writing-mode:vertical-rl]"
      role="status"
    >
      <UIcon
        :name="session.solved ? 'i-lucide-circle-check' : 'i-lucide-list-checks'"
        class="size-4 shrink-0"
        :class="session.solved ? 'text-success' : 'text-muted'"
      />
      {{ t('goals.count', { met: metCount, total: goals.length }) }}
    </p>
  </aside>

  <aside
    v-else
    :aria-label="t('play.panel.label')"
    class="flex min-h-0 flex-col gap-3"
  >
    <section
      class="flex flex-col overflow-hidden rounded-lg border border-default bg-elevated"
      :class="levelOpen ? 'lg:min-h-0 lg:flex-[3]' : 'shrink-0'"
    >
      <header
        class="flex items-center justify-between gap-2 px-3 py-1.5"
        :class="levelOpen && 'border-b border-default'"
      >
        <h2 class="font-mono text-xs font-medium text-muted">
          <button
            type="button"
            class="-mx-1 flex items-center gap-1.5 rounded px-1 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
            :aria-expanded="levelOpen"
            :aria-controls="levelId"
            @click="levelOpen = !levelOpen"
          >
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3.5 transition-transform"
              :class="!levelOpen && '-rotate-90'"
            />
            <UIcon
              name="i-lucide-flag"
              class="size-4"
            />
            {{ t('play.panel.level') }}
            <span
              v-if="!levelOpen"
              class="text-dimmed"
            >· {{ t('goals.count', { met: metCount, total: goals.length }) }}</span>
          </button>
        </h2>
        <UButton
          v-if="collapsible"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-panel-right-close"
          class="max-md:hidden"
          :aria-label="t('play.panel.collapse')"
          :aria-expanded="true"
          @click="collapsed = true"
        />
      </header>
      <div
        v-show="levelOpen"
        :id="levelId"
        class="overflow-y-auto p-3 lg:min-h-0 lg:flex-1"
      >
        <LevelPanel
          :level="level"
          :number="number"
          :total="total"
          :goals="goals"
          :hints-used="session.hintsUsed"
          :solved="session.solved"
          :conflicted-files="conflictedFiles"
          :next="next"
          @hint="hint"
          @reset="reset"
          @edit="edit"
          @debrief="debriefOpen = true"
        />
      </div>
    </section>

    <CommitGraph
      v-model:show-origin="showOrigin"
      v-model:open="graphOpen"
      :class="graphOpen && 'max-lg:h-80 lg:min-h-0 lg:flex-[2]'"
      :layout="graph"
      :has-origin="hasOrigin"
      collapsible
    />
  </aside>
</template>
