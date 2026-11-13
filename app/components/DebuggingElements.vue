<script setup lang="ts">
import { boxNumber, elementStyles, nodeLabel, treeMove, treeRows } from '#shared/levels'
import type { BoxModel, DomNode, RuleView, Sides, SourceLine, TreeRow } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// Debugging's Elements panel (docs/features/ui.md, "Elements"), in levels that use it (chapter 3). Read-only: fixes
// happen in the code. The app's DOM as a tree (a snapshot after each load, Refresh, or a pick; arrow keys like a file
// tree), and for the selected element the rules that apply in cascade order (struck through what lost, links to where
// each rule is written), what it inherits, its box and a few computed values. Pick: the next click in the app selects
// what it lands on. Hovering a row or selecting it outlines the element in the app. Everything from the frame is text.
const props = defineProps<{
  play: DebuggingPlaySession
  /** The panel is the one on screen (its outline shows in the app only then). */
  active: boolean
}>()

const { t } = useI18n()
const { dom, domTruncated, rules, selected, expanded, inspected, picking, hovered, pickedAt, find, refreshDom, selectNode, highlightNode, toggleNode, setPicking, openLine } = props.play

const rows = computed(() => treeRows(dom.value, expanded.value))
const selectedNode = computed(() => selected.value === null ? null : dom.value[selected.value] ?? null)
const styles = computed(() => inspected.value?.found ? elementStyles(rules.value, inspected.value) : null)

const tree = useTemplateRef<HTMLElement>('tree')
const detail = useTemplateRef<HTMLElement>('detail')

defineExpose({ focus: () => tree.value?.focus() })

// the outline in the app: the selected element while the panel is on screen (also in a new load's page), nothing while
// another panel is; in pick mode the app outlines what is under the pointer itself
watch([() => props.active, selected, dom, picking], () => {
  if (!picking.value) highlightNode(props.active ? null : -1)
})

function scrollToRow(id: number) {
  nextTick(() => tree.value?.querySelector<HTMLElement>(`[data-node="${id}"]`)?.scrollIntoView({ block: 'nearest' }))
}

/** A click on a row: select it (narrow: the details below the tree come into view). */
function select(row: TreeRow) {
  selectNode(row.node.id)
  nextTick(() => detail.value?.scrollIntoView({ block: 'nearest' }))
}

function onTreeKey(event: KeyboardEvent) {
  const move = treeMove(rows.value, selected.value, event.key)
  if (!move) return
  event.preventDefault()
  if ('select' in move) {
    selectNode(move.select)
    scrollToRow(move.select)
  } else if ('expand' in move) {
    toggleNode(move.expand, true)
  } else {
    toggleNode(move.collapse, false)
  }
}

// a pick in the app selects its element: the tree shows it and takes the focus (the next look starts there)
watch(pickedAt, () => {
  if (selected.value === null) return
  scrollToRow(selected.value)
  nextTick(() => tree.value?.focus({ preventScroll: true }))
})

/** What a row says to a screen reader: the element, its text, and whether it has no box or sticks out. */
const spoken = (node: DomNode) => [
  nodeLabel(node),
  node.text ? `“${node.text}”` : null,
  node.shown ? null : t('debugging.elements.notShown'),
  node.overflows ? t('debugging.elements.overflows') : null
].filter(Boolean).join(', ')

const where = (line: SourceLine) => `${line.path}:${line.line}`
const linkLabel = (line: SourceLine) => find ? t('debugging.console.answer', { path: line.path, line: line.line }) : t('debugging.console.open', { path: line.path, line: line.line })

const ruleKey = (rule: RuleView, index: number) => `${rule.source ? where(rule.source) : 'inline'}-${index}`

const sides = (values: Sides) => values.map(boxNumber).join(' ')
const boxSummary = (box: BoxModel) => t('debugging.elements.boxSummary', {
  width: boxNumber(box.width),
  height: boxNumber(box.height),
  padding: sides(box.padding),
  border: sides(box.border),
  margin: sides(box.margin)
})
const LAYERS = [
  { id: 'margin', classes: 'border-dashed border-warning/70 bg-warning/10' },
  { id: 'border', classes: 'border-default bg-elevated' },
  { id: 'padding', classes: 'border-success/60 bg-success/10' }
] as const

/** Content wider (or taller) than its box: how much, in pixels. */
const sticksOut = computed(() => {
  const scroll = inspected.value?.scroll
  if (!scroll) return null
  if (scroll.scrollWidth > scroll.clientWidth + 1 && scroll.clientWidth > 0) return { inner: scroll.scrollWidth, outer: scroll.clientWidth }
  return null
})
</script>

<template>
  <section
    :aria-label="t('debugging.elements.label')"
    class="@container flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex items-center justify-between gap-2 border-b border-(--app-terminal-border) px-3 py-1 text-xs text-muted">
      <span class="flex min-w-0 items-center gap-1.5">
        <UIcon
          name="i-lucide-code-xml"
          class="size-4 shrink-0"
        />
        {{ t('debugging.elements.label') }}
      </span>
      <span class="flex shrink-0 items-center gap-1.5">
        <UButton
          size="xs"
          :color="picking ? 'primary' : 'neutral'"
          :variant="picking ? 'subtle' : 'outline'"
          icon="i-lucide-mouse-pointer-2"
          :label="t('debugging.elements.pick')"
          :aria-label="t('debugging.elements.pickLabel')"
          :aria-pressed="picking"
          data-testid="elements-pick"
          @click="setPicking(!picking)"
        />
        <UButton
          size="xs"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :label="t('debugging.elements.refresh')"
          data-testid="elements-refresh"
          @click="refreshDom"
        />
      </span>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto @xl:grid @xl:grid-cols-[minmax(13rem,1fr)_minmax(0,1.25fr)] @xl:overflow-hidden">
      <!-- the DOM, as a tree -->
      <div
        class="@xl:min-h-0 @xl:overflow-y-auto @xl:border-e @xl:border-(--app-terminal-border)"
        @mouseleave="highlightNode(null)"
      >
        <p
          v-if="!rows.length"
          class="px-3 py-2 text-xs text-dimmed"
        >
          {{ t('debugging.elements.empty') }}
        </p>
        <ul
          v-else
          ref="tree"
          role="tree"
          :aria-label="t('debugging.elements.tree')"
          :aria-activedescendant="selected === null ? undefined : `element-${selected}`"
          tabindex="0"
          class="py-1 font-mono text-xs leading-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          data-testid="elements-tree"
          @keydown="onTreeKey"
        >
          <li
            v-for="row in rows"
            :id="`element-${row.node.id}`"
            :key="row.node.id"
            role="treeitem"
            :aria-level="row.depth + 1"
            :aria-expanded="row.hasChildren ? row.expanded : undefined"
            :aria-selected="row.node.id === selected"
            :aria-label="spoken(row.node)"
            :data-node="row.node.id"
            :data-label="nodeLabel(row.node)"
            class="flex cursor-pointer items-baseline gap-1 pe-2 whitespace-nowrap"
            :class="[
              row.node.id === selected ? 'bg-accented text-highlighted' : row.node.id === hovered ? 'bg-elevated' : 'hover:bg-elevated',
              row.node.shown ? '' : 'opacity-55'
            ]"
            :style="{ paddingInlineStart: `${row.depth * 0.75 + 0.25}rem` }"
            @click="select(row)"
            @mouseenter="highlightNode(row.node.id)"
          >
            <span
              class="inline-flex w-3.5 shrink-0 justify-center text-dimmed"
              aria-hidden="true"
              @click.stop="row.hasChildren && toggleNode(row.node.id, !row.expanded)"
            >
              <UIcon
                v-if="row.hasChildren"
                :name="row.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3"
              />
            </span>
            <span
              class="min-w-0 truncate"
              aria-hidden="true"
            ><span class="text-dimmed">&lt;</span><span class="text-info">{{ row.node.tag }}</span><template
              v-for="([name, value], index) in row.node.attrs"
              :key="index"
            ><span class="ms-[1ch] text-toned">{{ name }}</span><span class="text-dimmed">="</span><span class="text-warning">{{ value }}</span><span class="text-dimmed">"</span></template><span class="text-dimmed">&gt;</span><span
              v-if="row.node.text"
              class="ms-1 text-muted"
            >{{ row.node.text }}</span></span>
            <span
              v-if="row.node.overflows"
              class="shrink-0 rounded-sm border border-warning/60 px-1 font-sans text-[10px] leading-4 text-warning"
              aria-hidden="true"
              data-testid="elements-scroll"
            >{{ t('debugging.elements.scroll') }}</span>
          </li>
        </ul>
        <p
          v-if="domTruncated"
          class="px-3 py-1 text-xs text-dimmed"
        >
          {{ t('debugging.elements.truncated') }}
        </p>
      </div>

      <!-- the selected element: the rules that apply, what it inherits, its box, computed values -->
      <div
        v-if="selectedNode"
        ref="detail"
        role="region"
        tabindex="0"
        :aria-label="t('debugging.elements.details', { name: nodeLabel(selectedNode) })"
        class="border-t border-(--app-terminal-border) px-3 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary @xl:min-h-0 @xl:overflow-y-auto @xl:border-t-0"
        data-testid="elements-detail"
      >
        <p class="mb-2 font-mono break-all text-highlighted">
          {{ nodeLabel(selectedNode) }}
          <span
            v-if="!selectedNode.shown"
            class="ms-1 font-sans text-xs text-dimmed"
          >· {{ t('debugging.elements.notShown') }}</span>
        </p>
        <p
          v-if="inspected && !inspected.found"
          class="text-xs text-warning"
        >
          {{ t('debugging.elements.gone') }}
        </p>
        <template v-else-if="styles && inspected">
          <section
            :aria-label="t('debugging.elements.styles')"
            data-testid="elements-styles"
          >
            <h3 class="mb-1 text-xs font-medium text-highlighted">
              {{ t('debugging.elements.styles') }}
            </h3>
            <p
              v-if="!styles.rules.length"
              class="mb-2 text-xs text-dimmed"
            >
              {{ t('debugging.elements.noRules') }}
            </p>
            <DebuggingRule
              v-for="(rule, index) in styles.rules"
              :key="ruleKey(rule, index)"
              :rule="rule"
              :link-label="linkLabel"
              @open="openLine"
            />
            <template
              v-for="entry in styles.inherited"
              :key="entry.node"
            >
              <h4
                class="mt-3 mb-1 text-xs text-muted"
                data-testid="elements-inherited"
              >
                {{ t('debugging.elements.inheritedFrom') }} <span class="font-mono text-toned">{{ entry.label }}</span>
              </h4>
              <DebuggingRule
                v-for="(rule, index) in entry.rules"
                :key="ruleKey(rule, index)"
                :rule="rule"
                :link-label="linkLabel"
                @open="openLine"
              />
            </template>
            <p class="mt-2 text-xs text-dimmed">
              {{ t('debugging.elements.defaults') }}
            </p>
          </section>

          <section
            :aria-label="t('debugging.elements.box')"
            class="mt-3"
            data-testid="elements-box"
          >
            <h3 class="mb-1 text-xs font-medium text-highlighted">
              {{ t('debugging.elements.box') }}
            </h3>
            <template v-if="inspected.box">
              <p class="sr-only">
                {{ boxSummary(inspected.box) }}
              </p>
              <div
                class="max-w-80 font-mono text-[11px] text-toned tabular-nums"
                aria-hidden="true"
              >
                <!-- margin > border > padding > content, each with its four sides -->
                <div :class="['rounded-sm border px-1.5 pt-0.5 pb-1', LAYERS[0].classes]">
                  <div class="flex justify-between">
                    <span class="text-muted">{{ t('debugging.elements.margin') }}</span><span>{{ boxNumber(inspected.box.margin[0]) }}</span><span class="invisible">{{ t('debugging.elements.margin') }}</span>
                  </div>
                  <div class="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center text-center">
                    <span>{{ boxNumber(inspected.box.margin[3]) }}</span>
                    <div :class="['rounded-sm border px-1.5 pt-0.5 pb-1', LAYERS[1].classes]">
                      <div class="flex justify-between">
                        <span class="text-muted">{{ t('debugging.elements.border') }}</span><span>{{ boxNumber(inspected.box.border[0]) }}</span><span class="invisible">{{ t('debugging.elements.border') }}</span>
                      </div>
                      <div class="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center text-center">
                        <span>{{ boxNumber(inspected.box.border[3]) }}</span>
                        <div :class="['rounded-sm border px-1.5 pt-0.5 pb-1', LAYERS[2].classes]">
                          <div class="flex justify-between">
                            <span class="text-muted">{{ t('debugging.elements.padding') }}</span><span>{{ boxNumber(inspected.box.padding[0]) }}</span><span class="invisible">{{ t('debugging.elements.padding') }}</span>
                          </div>
                          <div class="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center text-center">
                            <span>{{ boxNumber(inspected.box.padding[3]) }}</span>
                            <span
                              class="rounded-sm border border-info/60 bg-info/15 px-1 py-1 whitespace-nowrap text-highlighted"
                              data-testid="elements-content-size"
                            >{{ boxNumber(inspected.box.width) }} × {{ boxNumber(inspected.box.height) }}</span>
                            <span>{{ boxNumber(inspected.box.padding[1]) }}</span>
                          </div>
                          <div class="text-center">
                            {{ boxNumber(inspected.box.padding[2]) }}
                          </div>
                        </div>
                        <span>{{ boxNumber(inspected.box.border[1]) }}</span>
                      </div>
                      <div class="text-center">
                        {{ boxNumber(inspected.box.border[2]) }}
                      </div>
                    </div>
                    <span>{{ boxNumber(inspected.box.margin[1]) }}</span>
                  </div>
                  <div class="text-center">
                    {{ boxNumber(inspected.box.margin[2]) }}
                  </div>
                </div>
              </div>
            </template>
            <p
              v-else
              class="text-xs text-dimmed"
            >
              {{ t('debugging.elements.noBox') }}
            </p>
            <p
              v-if="sticksOut"
              class="mt-1.5 text-xs text-warning"
              data-testid="elements-sticks-out"
            >
              {{ t('debugging.elements.sticksOut', sticksOut) }}
            </p>
          </section>

          <section
            :aria-label="t('debugging.elements.computed')"
            class="mt-3"
            data-testid="elements-computed"
          >
            <h3 class="mb-1 text-xs font-medium text-highlighted">
              {{ t('debugging.elements.computed') }}
            </h3>
            <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-xs">
              <template
                v-for="[name, value] in inspected.computed"
                :key="name"
              >
                <dt class="text-muted">
                  {{ name }}
                </dt>
                <dd
                  class="break-all text-toned"
                  :data-computed="name"
                >
                  {{ value }}
                </dd>
              </template>
            </dl>
          </section>
        </template>
        <p
          v-else
          class="text-xs text-dimmed"
        >
          {{ t('debugging.elements.reading') }}
        </p>
      </div>
      <p
        v-else-if="rows.length"
        class="border-t border-(--app-terminal-border) px-3 py-2 text-xs text-dimmed @xl:border-t-0"
      >
        {{ t('debugging.elements.select') }}
      </p>
    </div>
  </section>
</template>
