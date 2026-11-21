<script setup lang="ts">
import { DESCRIPTION_PATH } from '#shared/levels'
import type { DiffRow, FileDiff } from '#shared/levels'
import type { ReviewPlaySession } from '~/composables/useReviewPlay'
import type { Token } from '~/utils/review-highlight'
import { highlightLines } from '~/utils/review-highlight'

// One file of the pull request (docs/features/ui.md, "Working with AI play page"): its path and size, then its hunks as
// a unified diff, each row with its numbers before and after, added and removed rows tinted, the code in the editor's
// colours (as text). The numbers are one button per row: a click (a tap) opens the comment form on that row, Shift+click
// stretches it to another row of the hunk, a drag picks several rows. With the keyboard the file is one tab stop: Up and
// Down move along its rows, Shift with them picks rows, Enter opens the form, Escape lets go. Your comments sit after
// their last row, the open form after the rows it covers. Sous's description is drawn by it too (`file` is the
// description's, path `description`): its lines numbered once, as prose, the claims as a list, so a comment can point
// at a claim the same way.
const props = defineProps<{
  play: ReviewPlaySession
  file: FileDiff
}>()

const { t } = useI18n()
const { store, commentsAfter, inComment, isActive, select, startComment, commentSelection, clearSelection, selection } = props.play

/** Sous's description, not a file: one number per line, prose, the claims as a list. */
const isDescription = props.file.path === DESCRIPTION_PATH
const paragraphs = props.play.level.pr.description.length
/** The row is one of the claims (they follow the paragraphs). */
const isClaim = (row: DiffRow) => row.new !== null && row.new > paragraphs
/** The table's columns: the description has one number column, a file two. */
const columns = isDescription ? 2 : 3

const SIGN: Record<DiffRow['kind'], string> = { add: '+', del: '−', same: ' ' }
const ROW_TONE: Record<DiffRow['kind'], string> = { add: 'bg-success/10', del: 'bg-error/10', same: '' }
const NUMBER_TONE: Record<DiffRow['kind'], string> = { add: 'bg-success/15 text-toned', del: 'bg-error/15 text-toned', same: 'text-muted' }

// the code in the editor's colours, once each side's language has loaded
const tokens = shallowRef<{ head: Token[][] | null, base: Token[][] | null }>({ head: null, base: null })
onMounted(async () => {
  if (isDescription) return
  // the pull request as this round has it (a steer level's files change with Sous's commits)
  const { base, head } = props.play.pr.value
  const path = props.file.path
  try {
    const [after, before] = await Promise.all([
      Object.hasOwn(head, path) ? highlightLines(path, head[path]!) : null,
      Object.hasOwn(base, path) ? highlightLines(path, base[path]!) : null
    ])
    tokens.value = { head: after, base: before }
  } catch (error) {
    // no colours (the chunk could not load): the diff stays plain text
    console.error(error)
  }
})
function tokensOf(row: DiffRow): Token[] {
  const line = row.new !== null ? tokens.value.head?.[row.new - 1] : row.old !== null ? tokens.value.base?.[row.old - 1] : undefined
  return line ?? [{ text: row.text, cls: '' }]
}

/** Every row of the file in order, with its hunk and index, for the keyboard. */
const rows = computed(() => props.file.hunks.flatMap((hunk, h) => hunk.rows.map((row, index) => ({ hunk: h, index, row }))))
/** The row that takes the file's one tab stop. */
const focused = ref(0)
const flatIndex = (hunk: number, index: number) => rows.value.findIndex(each => each.hunk === hunk && each.index === index)
const table = useTemplateRef<HTMLElement>('table')
function focusRow(at: number) {
  focused.value = Math.min(Math.max(at, 0), rows.value.length - 1)
  nextTick(() => table.value?.querySelector<HTMLElement>(`[data-flat="${focused.value}"]`)?.focus())
}

const KIND_KEY: Record<DiffRow['kind'], string> = { add: 'added', del: 'removed', same: 'unchanged' }
function rowLabel(row: DiffRow): string {
  if (isDescription) return t('review.diff.descriptionLabel', { line: row.new, kind: t(isClaim(row) ? 'review.diff.kind.claim' : 'review.diff.kind.paragraph') })
  const where = row.kind === 'del' ? t('review.diff.lineRemoved', { line: row.old }) : t('review.diff.line', { line: row.new })
  return t('review.diff.rowLabel', { where, kind: t(`review.diff.kind.${KIND_KEY[row.kind]}`), path: props.file.path })
}

// dragging over the numbers picks rows (mouse and pen; a finger taps)
let dragging: { hunk: number, anchor: number } | null = null
let dragged = false
function onPointerDown(event: PointerEvent, hunk: number, index: number) {
  if (event.button !== 0 || event.pointerType === 'touch' || event.shiftKey) return
  dragging = { hunk, anchor: index }
  dragged = false
}
function onPointerEnter(hunk: number, index: number) {
  if (!dragging || dragging.hunk !== hunk) return
  if (index !== dragging.anchor) dragged = true
  if (!dragged) return
  select(props.file.path, hunk, dragging.anchor, false)
  select(props.file.path, hunk, index, true)
}
useEventListener(window, 'pointerup', () => {
  if (dragging && dragged) commentSelection()
  dragging = null
})

function onClick(event: MouseEvent, hunk: number, index: number) {
  focused.value = flatIndex(hunk, index)
  // the click that ends a drag: the form is open already
  if (dragged) {
    dragged = false
    return
  }
  startComment(props.file.path, hunk, index, event.shiftKey)
}

function onKeydown(event: KeyboardEvent, hunk: number, index: number) {
  const at = flatIndex(hunk, index)
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const to = Math.min(Math.max(at + (event.key === 'ArrowDown' ? 1 : -1), 0), rows.value.length - 1)
    const target = rows.value[to]!
    // Shift picks rows: from where the picking started, within one hunk
    if (event.shiftKey) {
      if (target.hunk !== hunk) return
      if (!selection.value) select(props.file.path, hunk, index, false)
      select(props.file.path, hunk, target.index, true)
    }
    focusRow(to)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    focusRow(event.key === 'Home' ? 0 : rows.value.length - 1)
  } else if (event.key === 'Enter' && selection.value && !event.shiftKey) {
    event.preventDefault()
    commentSelection()
  } else if (event.key === 'Escape' && selection.value) {
    event.preventDefault()
    clearSelection()
  }
}

/** The open form is on this file, after this row. */
const formAfter = (hunk: number, index: number) => {
  const draft = store.value.draft
  return draft !== null && draft.path === props.file.path && draft.hunk === hunk && Math.max(draft.anchor, draft.end) === index
}

/** Which lines the open form comments on, as text ("lines 10 to 13"). */
const draftLines = computed(() => {
  const place = props.play.draftPlace.value
  return place ? placeText(t, place) : ''
})

function saveNew() {
  const id = props.play.saveDraft()
  if (id !== null) nextTick(() => document.getElementById(`review-comment-${id}`)?.focus())
}

function cancelNew() {
  props.play.cancelDraft()
  focusRow(focused.value)
}

const collapsed = ref(false)
const STATUS_KEY = { added: 'added', deleted: 'deleted', modified: 'modified' } as const
</script>

<template>
  <section
    class="overflow-hidden rounded-lg border border-default"
    :class="isDescription ? 'bg-elevated' : 'bg-(--app-terminal)'"
    :aria-label="isDescription ? t('review.pr.description') : t('review.diff.file', { path: file.path, added: file.added, removed: file.removed })"
    :data-file="file.path"
    :data-testid="isDescription ? 'pr-description' : undefined"
  >
    <header
      v-if="isDescription"
      class="flex items-center gap-2 border-b border-default px-3 py-2 text-xs text-muted"
    >
      <span
        class="grid size-5 place-items-center rounded-full bg-accented font-mono text-[11px] font-semibold text-highlighted"
        aria-hidden="true"
      >S</span>
      <span><span class="font-medium text-highlighted">Sous</span> · {{ t('review.pr.assistant') }}</span>
    </header>
    <header
      v-else
      class="flex items-center gap-2 border-b border-default bg-elevated px-2 py-1.5"
    >
      <UButton
        size="xs"
        color="neutral"
        :icon="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
        :aria-label="collapsed ? t('review.diff.expand', { path: file.path }) : t('review.diff.collapse', { path: file.path })"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      />
      <h3 class="min-w-0 flex-1 font-mono text-xs font-medium break-all text-highlighted">
        {{ file.path }}
      </h3>
      <span
        v-if="file.status !== 'modified'"
        class="shrink-0 rounded-sm border border-default px-1 text-[11px] text-muted"
      >{{ t(`review.diff.status.${STATUS_KEY[file.status]}`) }}</span>
      <span
        class="shrink-0 font-mono text-xs tabular-nums"
        aria-hidden="true"
      ><span class="text-success">+{{ file.added }}</span> <span class="text-error">−{{ file.removed }}</span></span>
    </header>

    <div
      v-show="!collapsed"
      ref="table"
    >
      <table
        class="w-full table-fixed border-collapse [font-variant-ligatures:none]"
        :class="isDescription ? 'text-sm leading-6' : 'font-mono text-xs leading-6'"
      >
        <colgroup>
          <col class="w-8 sm:w-10">
          <col
            v-if="!isDescription"
            class="w-8 sm:w-10"
          >
          <col>
        </colgroup>
        <tbody
          v-for="(hunk, h) in file.hunks"
          :key="h"
        >
          <tr v-if="!isDescription">
            <td
              colspan="3"
              class="bg-info/8 px-2 py-0.5 text-info"
            >
              {{ hunk.header }}
            </td>
          </tr>
          <template
            v-for="(row, index) in hunk.rows"
            :key="index"
          >
            <tr
              :class="[ROW_TONE[row.kind], isActive(file.path, h, index) ? 'bg-primary/12!' : '']"
              :data-kind="row.kind"
              :data-row="row.new !== null ? `${file.path}:${row.new}` : `${file.path}:-${row.old}`"
            >
              <td
                :colspan="isDescription ? 1 : 2"
                class="p-0 align-top"
              >
                <button
                  type="button"
                  class="grid min-h-6 w-full cursor-pointer items-center border-s-2 text-end tabular-nums select-none hover:bg-primary/20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  :class="[isDescription ? 'grid-cols-1 py-0.5 font-mono text-xs leading-6' : 'grid-cols-2', NUMBER_TONE[row.kind], isActive(file.path, h, index) ? 'border-primary bg-primary/25 text-highlighted' : inComment(file.path, h, index) ? 'border-info' : 'border-transparent']"
                  :tabindex="flatIndex(h, index) === focused ? 0 : -1"
                  :aria-label="rowLabel(row)"
                  :aria-pressed="isActive(file.path, h, index)"
                  :data-flat="flatIndex(h, index)"
                  :data-old="row.old ?? undefined"
                  :data-new="row.new ?? undefined"
                  data-testid="diff-number"
                  @click="onClick($event, h, index)"
                  @keydown="onKeydown($event, h, index)"
                  @pointerdown="onPointerDown($event, h, index)"
                  @pointerenter="onPointerEnter(h, index)"
                >
                  <template v-if="isDescription">
                    <span class="pe-1.5">{{ row.new }}</span>
                  </template>
                  <template v-else>
                    <span class="pe-1.5">{{ row.old ?? '' }}</span>
                    <span class="pe-1.5">{{ row.new ?? '' }}</span>
                  </template>
                </button>
              </td>
              <td
                v-if="isDescription"
                class="py-0.5 ps-1.5 pe-3 align-top text-pretty [overflow-wrap:anywhere]"
                :class="isClaim(row) ? 'text-toned' : 'text-default'"
                :data-claim="isClaim(row) ? row.new! - paragraphs - 1 : undefined"
              >
                <span
                  v-if="isClaim(row)"
                  class="flex gap-2"
                ><span
                  class="select-none"
                  aria-hidden="true"
                >•</span><InlineText :text="row.text" /></span>
                <InlineText
                  v-else
                  :text="row.text"
                />
              </td>
              <td
                v-else
                class="py-0 pe-2 align-top whitespace-pre-wrap text-default [overflow-wrap:anywhere]"
              >
                <span
                  class="inline-block w-4 text-center select-none"
                  :class="row.kind === 'add' ? 'text-success' : row.kind === 'del' ? 'text-error' : ''"
                  aria-hidden="true"
                >{{ SIGN[row.kind] }}</span><span
                  v-for="(token, at) in tokensOf(row)"
                  :key="at"
                  :class="token.cls"
                >{{ token.text }}</span>
              </td>
            </tr>
            <tr v-if="formAfter(h, index)">
              <td
                :colspan="columns"
                class="bg-default p-2 font-sans"
              >
                <ReviewCommentForm
                  v-model:category="store.draft!.category"
                  v-model:text="store.draft!.text"
                  :lines="draftLines"
                  :save-label="t('review.comment.add')"
                  data-testid="comment-form"
                  @save="saveNew"
                  @cancel="cancelNew"
                />
              </td>
            </tr>
            <tr
              v-for="comment in commentsAfter(file.path, h, index)"
              :key="`comment-${comment.id}`"
            >
              <td
                :colspan="columns"
                class="bg-default p-2 font-sans"
              >
                <ReviewCommentCard
                  :play="play"
                  :comment="comment"
                />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
