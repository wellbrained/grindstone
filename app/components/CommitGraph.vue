<script setup lang="ts">
import type { GraphEdge, GraphLabel, GraphLayout } from '~/utils/graph-layout'
import { fitLabel, flowPills } from '~/utils/graph-labels'

// The commit graph as SVG: one lane per branch line, newest on top. The layout (rows, lanes, edges) comes from utils/graph-layout.ts;
// this component only turns it into coordinates and draws it. Motion is CSS (see the style block), switched off for prefers-reduced-motion.
// Labels fit the box: pills that do not fit side by side wrap onto further lines (the row grows by one line each), a pill
// or message wider than the box is cut with an ellipsis in the middle and keeps its full name as a tooltip.
const props = defineProps<{
  layout: GraphLayout
  /** Whether the repo has an origin, so the "show origin" toggle makes sense. */
  hasOrigin: boolean
}>()

const showOrigin = defineModel<boolean>('showOrigin', { default: false })

const { t } = useI18n()

const LANE_W = 22
const ROW_H = 42
const PAD_X = 16
const PAD_Y = 24
const DOT_R = 6
const PILL_H = 18
const CHAR_W = 6.6 // JetBrains Mono at 11px
const MAX_MESSAGE = 36
const LINE_H = 22
const PILL_GAP = 5
const FALLBACK_W = 300 // before the box is measured

const laneX = (lane: number) => PAD_X + lane * LANE_W
const truncate = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text

const textX = computed(() => laneX(Math.max(props.layout.laneCount, 1) - 1) + 22)

const pillText = (label: GraphLabel) => label.kind === 'local' && label.head ? `HEAD -> ${label.name}` : label.name

// the room for labels and messages: the box's width (without its padding) minus the lanes
const box = useTemplateRef<HTMLElement>('box')
const { width: boxWidth } = useElementSize(box)
const room = computed(() => Math.max(120, (boxWidth.value || FALLBACK_W) - textX.value - PAD_X))
const maxMessage = computed(() => Math.min(MAX_MESSAGE, Math.max(12, Math.floor(room.value / CHAR_W))))
const maxPillChars = computed(() => Math.max(8, Math.floor((room.value - 14) / CHAR_W)))

const rows = computed(() => {
  let top = PAD_Y
  return props.layout.nodes.map((node) => {
    const texts = node.labels.map(pillText)
    const shown = texts.map(text => fitLabel(text, maxPillChars.value))
    const widths = shown.map(text => Math.ceil(text.length * CHAR_W + 14))
    const flowed = flowPills(widths, room.value, PILL_GAP)
    const pills = node.labels.map((label, i) => ({
      label,
      text: shown[i]!,
      // the full name as a tooltip, only for a pill that was cut
      full: shown[i] === texts[i] ? null : texts[i]!,
      x: flowed.pills[i]!.x,
      line: flowed.pills[i]!.line,
      width: widths[i]!
    }))
    const message = truncate(node.message, maxMessage.value)
    // each extra line of pills makes the row taller
    const extra = Math.max(0, flowed.lines - 1) * LINE_H
    const row = {
      node,
      y: top,
      extra,
      cx: laneX(node.lane),
      pills,
      message,
      // commits with labels get two lines: the pills on top, the message below; the others just the message
      labelled: pills.length > 0,
      end: Math.max(...pills.map(pill => pill.x + pill.width), message.length * CHAR_W),
      head: node.labels.some(label => label.head),
      title: [node.shortId, node.message, node.labels.length ? `(${texts.join(', ')})` : ''].filter(Boolean).join(' ')
    }
    top += ROW_H + extra
    return row
  })
})

// a row's y by its row number (a row's top is the sum of the rows above it)
const rowYs = computed(() => new Map(rows.value.map(row => [row.node.row, row.y])))
const rowY = (row: number) => rowYs.value.get(row) ?? PAD_Y + row * ROW_H

function edgePath(edge: GraphEdge): string {
  const x1 = laneX(edge.fromLane)
  const y1 = rowY(edge.fromRow)
  const x2 = laneX(edge.toLane)
  const y2 = rowY(edge.toRow)
  // A line that forks off stays in its lane and bends into the parent's lane at the end; a merged-in line bends out right at the merge commit.
  // Always the same command structure, so the browser can animate the path (CSS `d`) when rows move.
  const ya = edge.merge ? y1 : Math.max(y1, y2 - ROW_H)
  const yb = edge.merge ? Math.min(y2, y1 + ROW_H) : y2
  const k = (yb - ya) / 2
  return `M${x1} ${y1}V${ya}C${x1} ${ya + k} ${x2} ${yb - k} ${x2} ${yb}V${y2}`
}

const edges = computed(() => props.layout.edges.map(edge => ({ edge, d: edgePath(edge) })))

const width = computed(() => Math.max(220, textX.value + Math.max(0, ...rows.value.map(row => row.end)) + PAD_X))
const height = computed(() => {
  const last = rows.value.at(-1)
  return last ? last.y + last.extra + PAD_Y : PAD_Y * 2
})

const summary = computed(() => t('graph.summary', props.layout.nodes.length))
</script>

<template>
  <section
    :aria-label="t('graph.label')"
    class="flex h-full min-h-48 flex-col overflow-hidden rounded-lg border border-default bg-elevated"
  >
    <header class="flex items-center justify-between gap-3 border-b border-default px-3 py-1.5">
      <h2 class="flex items-center gap-1.5 font-mono text-xs font-medium text-muted">
        <UIcon
          name="i-lucide-git-fork"
          class="size-4"
        />
        {{ t('graph.title') }}
      </h2>
      <USwitch
        v-if="hasOrigin"
        v-model="showOrigin"
        size="xs"
        :label="t('graph.showOrigin')"
      />
    </header>

    <div
      ref="box"
      class="min-h-0 flex-1 overflow-auto p-2 [scrollbar-gutter:stable]"
    >
      <p
        v-if="!layout.nodes.length"
        class="px-2 py-6 text-center text-sm text-muted"
      >
        {{ t('graph.empty') }}
      </p>
      <template v-else>
        <svg
          class="block font-mono text-[11px]"
          role="img"
          :aria-label="summary"
          :width="width"
          :height="height"
          :viewBox="`0 0 ${width} ${height}`"
        >
          <g>
            <path
              v-for="{ edge, d } in edges"
              :key="edge.id"
              :d="d"
              :style="{ '--d': `path('${d}')` }"
              class="cg-edge"
              :class="branchClass(edge.branch)"
            />
          </g>
          <g>
            <g
              v-for="row in rows"
              :key="row.node.id"
              class="cg-row"
              :style="{ transform: `translateY(${row.y}px)` }"
            >
              <title>{{ row.title }}</title>
              <g :class="branchClass(row.node.branch)">
                <circle
                  class="cg-ring"
                  :cx="row.cx"
                  r="9"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                />
                <circle
                  v-if="row.head"
                  :cx="row.cx"
                  :r="DOT_R + 4"
                  fill="none"
                  stroke="var(--ui-text-highlighted)"
                  stroke-width="1.5"
                />
                <circle
                  class="cg-dot"
                  :cx="row.cx"
                  :r="DOT_R"
                  fill="currentColor"
                />
              </g>
              <g
                v-for="pill in row.pills"
                :key="pill.label.name"
                :class="pill.label.kind === 'head' ? 'text-highlighted' : pill.label.kind === 'tag' ? 'text-muted' : branchClass(pill.label.branch)"
                :transform="`translate(${textX + pill.x} ${pill.line * LINE_H - 10})`"
              >
                <title v-if="pill.full">{{ pill.full }}</title>
                <rect
                  :y="-PILL_H / 2"
                  :width="pill.width"
                  :height="PILL_H"
                  :rx="pill.label.kind === 'tag' ? 4 : 9"
                  :fill="pill.label.kind === 'local' || pill.label.kind === 'head' ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  :stroke-width="pill.label.kind === 'tag' ? 1 : 1.5"
                  :stroke-dasharray="pill.label.kind === 'origin' ? '3 2' : undefined"
                />
                <text
                  :x="pill.width / 2"
                  text-anchor="middle"
                  dominant-baseline="central"
                  :font-weight="pill.label.kind === 'tag' ? 500 : 600"
                  :fill="pill.label.kind === 'local' ? 'var(--branch-ink)' : pill.label.kind === 'head' ? 'var(--ui-bg-elevated)' : 'currentColor'"
                >{{ pill.text }}</text>
              </g>
              <text
                :x="textX"
                :y="row.labelled ? 10 + row.extra : 0"
                dominant-baseline="central"
                fill="var(--ui-text-toned)"
              >{{ row.message }}</text>
            </g>
          </g>
        </svg>
        <ol class="sr-only">
          <li
            v-for="row in rows"
            :key="row.node.id"
          >
            {{ row.title }}
          </li>
        </ol>
      </template>
    </div>

    <p class="border-t border-default px-3 py-1.5 text-xs text-muted">
      {{ t('graph.legend') }}
    </p>
  </section>
</template>

<style>
.cg-row {
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s ease;
}

.cg-edge {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  d: var(--d);
  transition: d 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s ease;
}

.cg-dot {
  stroke: var(--ui-bg-elevated);
  stroke-width: 2;
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.cg-ring {
  transform-box: fill-box;
  transform-origin: center;
  animation: spark-ring 0.7s ease-out both;
  pointer-events: none;
}

/* a new commit fades and pops in (also the first draw: it is short) */
@starting-style {
  .cg-row,
  .cg-edge {
    opacity: 0;
  }

  .cg-dot {
    transform: scale(0.2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cg-row,
  .cg-edge,
  .cg-dot {
    transition: none;
  }

  .cg-ring {
    animation: none;
    display: none;
  }
}
</style>
