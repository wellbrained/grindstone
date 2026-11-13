<script setup lang="ts">
import type { ChapterView } from '~/utils/track-view'

// The chapters of a track as a vertical list: commit dot in the chapter's colour, name, mini progress bar, n/m.
// On the track page (`jump`) the entries are in-page links that report the jump and mark the chapter in view with
// aria-current; on the home page they link to the chapter's section on the track page. On the track page the list is
// also the skill radar's legend: hovering or focusing a row reports its chapter (`highlight`), and the row of the axis
// hovered in the radar is lit up (`highlight` prop).
const props = defineProps<{
  chapters: ChapterView[]
  label: string
  /** In-page: the chapter in view. */
  active?: string | null
  /** Link to the track page instead of jumping in-page. */
  trackId?: string
  /** The chapter whose axis is hovered in the skill radar. */
  highlight?: string | null
}>()

const emit = defineEmits<{ jump: [id: string], highlight: [id: string | null] }>()
// leaving a row with the mouse keeps the keyboard-focused row lit
const focusedChapter = () => document.activeElement?.closest('[data-chapter-link]')?.getAttribute('data-chapter-link') ?? null

const { t } = useI18n()

function onClick(event: MouseEvent, id: string) {
  // in-page jump; a modified click (new tab) keeps the browser's behaviour
  if (props.trackId || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  emit('jump', id)
}
</script>

<template>
  <nav :aria-label="label">
    <ol class="space-y-0.5">
      <li
        v-for="item in chapters"
        :key="item.chapter.id"
      >
        <a
          :href="trackId ? trackPath(trackId, item.chapter.id) : `#${item.chapter.id}`"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:text-highlighted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          :class="[
            // on the page the rail sits on the ground; on the home page's track card (trackId) it sits on an elevated card
            trackId ? 'hover:bg-accented' : 'hover:bg-elevated',
            active === item.chapter.id ? 'bg-elevated font-medium text-highlighted'
            : highlight === item.chapter.id ? 'bg-elevated text-highlighted'
              : item.coming ? 'text-muted' : 'text-toned'
          ]"
          :aria-current="active === item.chapter.id ? 'true' : undefined"
          :data-chapter-link="item.chapter.id"
          @click="onClick($event, item.chapter.id)"
          @mouseenter="emit('highlight', item.chapter.id)"
          @mouseleave="emit('highlight', focusedChapter())"
          @focus="emit('highlight', item.chapter.id)"
          @blur="emit('highlight', null)"
        >
          <CommitDot
            size="sm"
            :colour="item.chapter.colour"
            :state="item.state"
          />
          <span class="min-w-0 flex-1 truncate">{{ item.chapter.title }}</span>
          <template v-if="!item.coming">
            <ProgressMeter
              class="h-1 w-11 shrink-0"
              :class="paletteClass(item.chapter.colour)"
              :count="item.count"
            />
            <span class="w-8 shrink-0 text-right font-mono text-xs font-normal text-muted tabular-nums">
              <span aria-hidden="true">{{ item.count.solved }}/{{ item.count.total }}</span>
              <span class="sr-only">{{ t('track.solvedCount', { solved: item.count.solved, total: item.count.total }) }}</span>
            </span>
          </template>
          <span
            v-else
            class="shrink-0 text-xs font-normal text-muted"
          >{{ t('track.coming') }}</span>
        </a>
      </li>
    </ol>
  </nav>
</template>
