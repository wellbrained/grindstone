<script setup lang="ts">
import { deployChanges } from '#shared/levels'
import type { Deploy, DiffLine, FileChange } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// Debugging's Deploys panel (docs/features/ui.md, "Deploys"), in chapter 7's levels: the shop's last deploys, newest
// first, each with who, when and why, the files it changed and its diff (git's unified diff, in the terminal's colours).
// A changed line of a diff opens where it is in your saved code now (in a find task it is an answer). Roll back puts a
// deploy's files in the editor, saved, after a confirmation that says what changes; Reload runs them. In a find task
// whose answer is a deploy, each deploy can be the answer. Everything is text.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { ask } = useConfirm()
const { deployHistory, savedVersion, rollbackPreview, rollbackTo, canUndoRollback, undoRollback, answerDeploy, openDiffLine, find, store, checking, unsaved } = props.play

/** Undo roll back; its button is gone afterwards, so the focus goes to the note that says what the saved code is. */
function undo() {
  undoRollback()
  nextTick(() => savedNote.value?.focus())
}

/** Newest first, like a deploy tool lists them. */
const deploys = computed<Deploy[]>(() => [...(deployHistory?.list ?? [])].reverse())
const liveId = deployHistory?.list.at(-1)?.id ?? null

/** The diffs of the deploys that are open (each worked out once). */
const opened = ref<Set<string>>(new Set())
const changes = new Map<string, FileChange[]>()
function changesOf(id: string): FileChange[] {
  let found = changes.get(id)
  if (!found && deployHistory) {
    found = deployChanges(deployHistory, id)
    changes.set(id, found)
  }
  return found ?? []
}
function onToggle(id: string, event: Event) {
  const next = new Set(opened.value)
  if ((event.target as HTMLDetailsElement).open) next.add(id)
  else next.delete(id)
  opened.value = next
}

const counts = (id: string) => changesOf(id).reduce((sum, change) => ({ added: sum.added + change.added, removed: sum.removed + change.removed }), { added: 0, removed: 0 })

const savedNote = useTemplateRef<HTMLElement>('savedNote')
const list = useTemplateRef<HTMLElement>('list')
defineExpose({ focus: () => (list.value?.querySelector<HTMLElement>('button, summary') ?? savedNote.value)?.focus() })

/** "order.js and money.js", "a.js, b.js and c.js". */
function names(paths: readonly string[]): string {
  if (paths.length < 2) return paths[0] ?? ''
  return t('debugging.lowerList', { first: paths.slice(0, -1).join(', '), last: paths.at(-1) })
}

/** Roll back to a deploy, after a confirmation that says what it changes. */
function askRollback(deploy: Deploy) {
  const { paths, replaced, unsaved: dropped, undoable } = rollbackPreview(deploy.id)
  const back = deploy.id === liveId
  // how to get back: your own saved code comes back with Undo roll back, a version of the list with its own Roll back
  const undo = undoable
    ? (replaced.length ? t('debugging.deploys.confirmReplaced', { files: names(replaced) }) : t('debugging.deploys.confirmUndoCopy'))
    : t('debugging.deploys.confirmUndo', { id: savedVersion.value })
  const text = [
    paths.length ? t('debugging.deploys.confirmFiles', { files: names(paths), id: deploy.id, author: deploy.author, at: deploy.at }) : t('debugging.deploys.confirmSame', { id: deploy.id }),
    paths.length ? undo : '',
    dropped.length ? t('debugging.deploys.confirmUnsaved', { files: names(dropped) }) : ''
  ].filter(Boolean).join(' ')
  ask({
    title: back ? t('debugging.deploys.confirmLiveTitle', { id: deploy.id }) : t('debugging.deploys.confirmTitle', { id: deploy.id }),
    text,
    confirmLabel: back ? t('debugging.deploys.backToLive') : t('debugging.deploys.rollBack'),
    onConfirm: () => rollbackTo(deploy.id),
    // the button that opened the dialog is gone once its version is the saved code: the note says what happened
    focusAfter: () => savedNote.value?.focus()
  })
}

/** What your saved code is, in the deploys' terms. */
const savedText = computed(() => {
  if (savedVersion.value === liveId) return t('debugging.deploys.savedLive', { id: liveId })
  if (savedVersion.value) return t('debugging.deploys.savedRolledBack', { id: savedVersion.value })
  return t('debugging.deploys.savedChanged')
})
const unsavedText = computed(() => unsaved.value.length ? t('debugging.deploys.unsavedToo') : '')

const SIGN: Record<DiffLine['kind'], string> = { add: '+', del: '-', same: ' ' }
const LINE_TONE: Record<DiffLine['kind'], string> = { add: 'text-success bg-success/8', del: 'text-error bg-error/8', same: 'text-toned' }

/** A changed line of a diff: open it in Code (or answer with it in a find task). */
const lineLabel = (line: DiffLine, path: string) => t(find ? 'debugging.deploys.answerLine' : 'debugging.deploys.openLine', {
  kind: t(`debugging.deploys.kind.${line.kind}`),
  path,
  line: line.new ?? line.old
})

/** A find task's answer was this deploy: right or wrong. */
const answered = (id: string) => store.value.answer && 'deploy' in store.value.answer && store.value.answer.deploy === id ? store.value.answer : null
</script>

<template>
  <section
    :aria-label="t('debugging.deploys.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-(--app-terminal-border) px-3 py-1.5 text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-rocket"
          class="size-4"
        />
        {{ t('debugging.deploys.label') }}
        <span class="font-mono text-dimmed tabular-nums">{{ t('debugging.deploys.count', deploys.length) }}</span>
      </span>
      <p
        ref="savedNote"
        tabindex="-1"
        role="status"
        class="min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
        data-testid="deploys-saved"
      >
        {{ savedText }} {{ unsavedText }}
      </p>
      <UButton
        v-if="canUndoRollback"
        size="xs"
        color="neutral"
        icon="i-lucide-undo-2"
        :label="t('debugging.deploys.undo')"
        :disabled="checking"
        data-testid="deploys-undo"
        @click="undo"
      />
    </header>

    <ol
      ref="list"
      :aria-label="t('debugging.deploys.list')"
      class="min-h-0 flex-1 overflow-y-auto"
      data-testid="deploys-list"
    >
      <li
        v-for="deploy in deploys"
        :key="deploy.id"
        class="border-b border-(--app-terminal-border) px-3 py-2 last:border-b-0"
        :class="answered(deploy.id) ? (answered(deploy.id)!.right ? 'bg-success/8' : 'bg-warning/8') : ''"
        :data-deploy="deploy.id"
        data-testid="deploy"
      >
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="font-mono text-xs text-highlighted">{{ deploy.id }}</span>
          <span
            v-if="deploy.id === liveId"
            class="rounded-sm border border-success/40 px-1 text-[11px] text-success"
          >{{ t('debugging.deploys.live') }}</span>
          <span
            v-if="deploy.id === savedVersion"
            class="rounded-sm border border-info/40 px-1 text-[11px] text-info"
            data-testid="deploy-saved"
          >{{ t('debugging.deploys.saved') }}</span>
          <span class="text-xs text-muted">{{ deploy.author }} · {{ deploy.at }}</span>
        </div>
        <p class="mt-0.5 text-sm break-words text-highlighted">
          {{ deploy.message }}
        </p>
        <div class="mt-1.5 flex flex-wrap items-center gap-2">
          <UButton
            v-if="deploy.id !== savedVersion"
            size="xs"
            color="neutral"
            :icon="deploy.id === liveId ? 'i-lucide-redo-2' : 'i-lucide-undo-2'"
            :label="deploy.id === liveId ? t('debugging.deploys.backToLive') : t('debugging.deploys.rollBackTo', { id: deploy.id })"
            :disabled="checking"
            data-testid="deploy-rollback"
            @click="askRollback(deploy)"
          />
          <UButton
            v-if="find?.deploys"
            size="xs"
            color="primary"
            icon="i-lucide-mouse-pointer-click"
            :label="t('debugging.deploys.answer', { id: deploy.id })"
            data-testid="deploy-answer"
            @click="answerDeploy(deploy.id)"
          />
        </div>
        <details
          class="mt-1.5"
          @toggle="onToggle(deploy.id, $event)"
        >
          <summary class="cursor-pointer rounded-sm text-xs text-muted hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary">
            {{ t('debugging.deploys.changes', { files: changesOf(deploy.id).map(change => change.path).join(', ') }) }}
            <span class="font-mono"><span class="text-success">+{{ counts(deploy.id).added }}</span> <span class="text-error">-{{ counts(deploy.id).removed }}</span></span>
          </summary>
          <div
            v-if="opened.has(deploy.id)"
            class="mt-1 space-y-2"
            data-testid="deploy-diff"
          >
            <section
              v-for="change in changesOf(deploy.id)"
              :key="change.path"
              :aria-label="t('debugging.deploys.file', { path: change.path, added: change.added, removed: change.removed })"
              class="overflow-hidden rounded-md border border-(--app-terminal-border) font-mono text-xs"
            >
              <h4 class="border-b border-(--app-terminal-border) bg-elevated/60 px-2 py-0.5 font-medium break-all text-highlighted">
                {{ change.path }}
              </h4>
              <template
                v-for="(hunk, hunkIndex) in change.hunks"
                :key="hunkIndex"
              >
                <p class="px-2 text-info">
                  {{ hunk.header }}
                </p>
                <ol>
                  <li
                    v-for="(line, index) in hunk.lines"
                    :key="index"
                    class="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-1"
                    :class="LINE_TONE[line.kind]"
                    :data-kind="line.kind"
                  >
                    <span
                      class="pe-1 text-end text-dimmed tabular-nums select-none"
                      aria-hidden="true"
                    >{{ line.new ?? '' }}</span>
                    <button
                      v-if="line.kind !== 'same'"
                      type="button"
                      class="cursor-pointer pe-2 text-start break-words whitespace-pre-wrap hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                      :data-line="`${change.path}:${line.at}`"
                      data-testid="diff-line"
                      @click="openDiffLine(deploy.id, change.path, line.at)"
                    >
                      <span class="sr-only">{{ lineLabel(line, change.path) }}: </span><span aria-hidden="true">{{ SIGN[line.kind] }}</span>{{ line.text }}
                    </button>
                    <span
                      v-else
                      class="pe-2 break-words whitespace-pre-wrap"
                    ><span aria-hidden="true">{{ SIGN[line.kind] }}</span>{{ line.text }}</span>
                  </li>
                </ol>
              </template>
            </section>
          </div>
        </details>
      </li>
    </ol>
  </section>
</template>
