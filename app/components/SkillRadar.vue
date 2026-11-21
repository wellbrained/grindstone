<script setup lang="ts">
import { isRadarEmpty } from '#shared/levels'
import type { RadarAxis } from '#shared/levels'
import {
  RADAR_CENTRE,
  RADAR_DOT_AT,
  RADAR_RINGS,
  RADAR_VIEW,
  easeOutCubic,
  nearestRadarAxis,
  radarPoint,
  radarPolygon,
  radarShape,
  tweenShares
} from '~/utils/skill-radar'

// The skill radar of a track (ADR 0007, docs/features/ui.md "Skill radar"), drawn after the logo's mark: rings at a
// third, two thirds and all of a chapter, a spoke per chapter clockwise from the top, your shape in ember with a dot per
// corner, each axis ending in its chapter's dot (the chapter list is the legend, so no labels). A coming chapter is a
// dashed spoke and dot. The picture is decoration (aria-hidden); screen readers get the list below it.
// `from` (the debrief): the radar before the solve, drawn as a faint dashed outline; the shape grows from it once.
// `hoverable` (the track page): hovering near an axis reports its chapter, so the page can light up the list row.
// `labels` (home, one axis per track): each axis also names its track and its solved count beside its dot, so the
// picture reads without the list; the drawing grows a margin for them.
const props = defineProps<{
  axes: RadarAxis[]
  /** The chapter whose axis is lit (spoke in its colour). */
  highlight?: string | null
  from?: RadarAxis[] | null
  hoverable?: boolean
  labels?: boolean
}>()

const emit = defineEmits<{ highlight: [chapterId: string | null] }>()

const { t } = useI18n()

/** The shape waits for the dialog to open, then grows in this long. */
const GROW_DELAY_MS = 250
const GROW_MS = 600

const count = computed(() => props.axes.length)
const empty = computed(() => isRadarEmpty(props.axes))
const shares = computed(() => props.axes.map(axis => axis.share))
const before = computed(() => props.from && props.from.length === props.axes.length ? props.from.map(axis => axis.share) : null)
const changed = computed(() => before.value !== null && before.value.some((share, index) => share !== shares.value[index]))

// 0 → 1 while the shape grows from `from`; 1 when there is nothing to grow (or under reduced motion)
const grown = ref(1)
let frame = 0
onMounted(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (!changed.value || reduce) return
  grown.value = 0
  const start = performance.now() + GROW_DELAY_MS
  const step = (now: number) => {
    grown.value = Math.min(1, Math.max(0, (now - start) / GROW_MS))
    if (grown.value < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))

const shape = computed(() => radarShape(before.value && grown.value < 1
  ? tweenShares(before.value, shares.value, easeOutCubic(grown.value))
  : shares.value))

const point = (index: number, share: number) => radarPoint(index, count.value, share)

/** The drawing's box: the radar alone, or with room around it for the labels. */
const LABEL_X = 84
const LABEL_Y = 34
const LINE = 15
const viewBox = computed(() => props.labels
  ? `${-LABEL_X} ${-LABEL_Y} ${RADAR_VIEW + 2 * LABEL_X} ${RADAR_VIEW + 2 * LABEL_Y}`
  : `0 0 ${RADAR_VIEW} ${RADAR_VIEW}`)
/** Where an axis's label sits and which way it reads: centred above or below a vertical axis, else away from the centre;
 *  a long name beside the radar takes two lines. */
const labelOf = (axis: RadarAxis, index: number) => {
  const [x, y] = point(index, 1.24)
  const dx = x - RADAR_CENTRE
  const dy = y - RADAR_CENTRE
  const anchor = Math.abs(dx) < 8 ? 'middle' : dx > 0 ? 'start' : 'end'
  const title = axis.chapter.title
  const split = anchor !== 'middle' && title.length > 10 ? title.indexOf(' ') : -1
  const lines = split > 0 ? [title.slice(0, split), title.slice(split + 1)] : [title]
  // above the top axis the label ends at the dot; below the bottom one it starts there; beside, it is centred on it
  const height = (lines.length + 1) * LINE
  const top = Math.abs(dx) < 8 ? (dy < 0 ? y - height + 8 : y + 6) : y - height / 2 + 11
  return { x, top, anchor, lines, count: axis.coming ? t('radar.comingShort') : `${axis.solved}/${axis.total}` }
}
const ring = (share: number) => radarPolygon(props.axes.map(() => share))

// hovering near an axis (track page): lights it up here and tells the page
const hovered = ref<string | null>(null)
const lit = computed(() => hovered.value ?? props.highlight ?? null)

function hover(chapterId: string | null) {
  if (hovered.value === chapterId) return
  hovered.value = chapterId
  emit('highlight', chapterId)
}

function onPointerMove(event: PointerEvent) {
  if (!props.hoverable) return
  const box = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  if (box.width === 0) return
  // the drawing's own units: with labels the box has a margin around the radar
  const marginX = props.labels ? LABEL_X : 0
  const marginY = props.labels ? LABEL_Y : 0
  const scale = (RADAR_VIEW + 2 * marginX) / box.width
  const index = nearestRadarAxis((event.clientX - box.left) * scale - marginX, (event.clientY - box.top) * scale - marginY, count.value)
  hover(index === null ? null : props.axes[index]!.chapter.id)
}

function onPointerLeave() {
  if (props.hoverable) hover(null)
}
</script>

<template>
  <div class="flex flex-col items-center">
    <svg
      :viewBox="viewBox"
      class="block h-auto w-full overflow-visible"
      fill="none"
      stroke-linejoin="round"
      aria-hidden="true"
      data-testid="skill-radar"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
    >
      <!-- the grid: rings and spokes, faint like the logo's -->
      <g class="text-(--ui-border-accented)">
        <polygon
          v-for="share in RADAR_RINGS"
          :key="share"
          :points="ring(share)"
          stroke="currentColor"
          :stroke-width="share === 1 ? 1.4 : 1"
          :opacity="share === 1 ? 0.9 : 0.55"
        />
      </g>
      <line
        v-for="(axis, index) in axes"
        :key="`spoke-${axis.chapter.id}`"
        :x1="RADAR_CENTRE"
        :y1="RADAR_CENTRE"
        :x2="point(index, 1)[0]"
        :y2="point(index, 1)[1]"
        :class="lit === axis.chapter.id ? paletteClass(axis.chapter.colour) : 'text-(--ui-border-accented)'"
        stroke="currentColor"
        :stroke-width="lit === axis.chapter.id ? 1.6 : 1"
        :stroke-dasharray="axis.coming ? '3 4' : undefined"
        :opacity="lit === axis.chapter.id ? 1 : 0.6"
        :data-axis="axis.chapter.id"
      />

      <g class="text-primary">
        <!-- the shape before this solve -->
        <polygon
          v-if="changed && before"
          :points="radarPolygon(radarShape(before))"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-dasharray="2 3"
          opacity="0.6"
          data-testid="radar-before"
        />
        <template v-if="!empty">
          <polygon
            :points="radarPolygon(shape)"
            fill="currentColor"
            fill-opacity="0.28"
            stroke="currentColor"
            stroke-width="2"
            data-testid="radar-shape"
          />
          <template
            v-for="(axis, index) in axes"
            :key="`corner-${axis.chapter.id}`"
          >
            <circle
              v-if="!axis.coming"
              :cx="point(index, shape[index]!)[0]"
              :cy="point(index, shape[index]!)[1]"
              :r="lit === axis.chapter.id ? 4 : 3"
              fill="currentColor"
            />
          </template>
        </template>
      </g>

      <!-- each axis ends in its chapter's dot; the chapter list is the legend -->
      <circle
        v-for="(axis, index) in axes"
        :key="`dot-${axis.chapter.id}`"
        :cx="point(index, RADAR_DOT_AT)[0]"
        :cy="point(index, RADAR_DOT_AT)[1]"
        :r="axis.coming ? 4 : 4.5"
        :class="[paletteClass(axis.chapter.colour), axis.coming ? '' : 'fill-(--dot-ground,var(--ui-bg))']"
        stroke="currentColor"
        :stroke-width="axis.coming ? 1.5 : 2"
        :stroke-dasharray="axis.coming ? '2 2' : undefined"
        :opacity="axis.coming ? 0.7 : 1"
      />

      <!-- home: the track's name and count beside its dot (the list below stays the accessible version) -->
      <template v-if="labels">
        <text
          v-for="(axis, index) in axes"
          :key="`label-${axis.chapter.id}`"
          :text-anchor="labelOf(axis, index).anchor"
          stroke="none"
          :class="lit === axis.chapter.id ? 'fill-(--ui-text-highlighted)' : 'fill-(--ui-text-toned)'"
          :data-label="axis.chapter.id"
        >
          <tspan
            v-for="(line, lineIndex) in labelOf(axis, index).lines"
            :key="lineIndex"
            :x="labelOf(axis, index).x"
            :y="labelOf(axis, index).top + lineIndex * LINE"
            font-size="13"
            font-weight="500"
          >{{ line }}</tspan>
          <tspan
            :x="labelOf(axis, index).x"
            :y="labelOf(axis, index).top + labelOf(axis, index).lines.length * LINE"
            font-size="11"
            class="fill-(--ui-text-muted) font-mono"
          >{{ labelOf(axis, index).count }}</tspan>
        </text>
      </template>
    </svg>

    <p
      v-if="empty"
      class="mt-2 text-center text-sm text-muted"
    >
      {{ t('radar.empty') }}
    </p>

    <ul
      class="sr-only"
      :aria-label="t('radar.label')"
    >
      <li
        v-for="axis in axes"
        :key="axis.chapter.id"
      >
        {{ axis.coming
          ? t('radar.coming', { chapter: axis.chapter.title })
          : t('radar.axis', { chapter: axis.chapter.title, solved: axis.solved, total: axis.total }) }}
      </li>
    </ul>
  </div>
</template>
