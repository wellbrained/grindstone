<script setup lang="ts">
import type { DiffRow, FileDiff } from '#shared/levels'

// What one of Sous's commits changed (docs/features/ui.md, "Working with AI play page", steer levels): a read-only
// unified diff, file by file, from the round before the commit to the round after it. Comments sit on the whole pull
// request below, never here. Plain text, the same tints as the diff you review.
defineProps<{ changes: FileDiff[] }>()

const { t } = useI18n()

const SIGN: Record<DiffRow['kind'], string> = { add: '+', del: '−', same: ' ' }
const ROW_TONE: Record<DiffRow['kind'], string> = { add: 'bg-success/10', del: 'bg-error/10', same: '' }
const NUMBER_TONE: Record<DiffRow['kind'], string> = { add: 'text-success', del: 'text-error', same: 'text-dimmed' }
</script>

<template>
  <p
    v-if="!changes.length"
    class="text-xs text-muted"
    data-testid="steer-commit-empty"
  >
    {{ t('review.steer.noChanges') }}
  </p>
  <div
    v-else
    class="space-y-2"
    data-testid="steer-commit-diff"
  >
    <section
      v-for="file in changes"
      :key="file.path"
      class="overflow-hidden rounded-md border border-default bg-(--app-terminal)"
      :aria-label="t('review.diff.file', { path: file.path, added: file.added, removed: file.removed })"
      :data-commit-file="file.path"
    >
      <h4 class="flex items-center gap-2 border-b border-default bg-elevated px-2 py-1 font-mono text-xs text-highlighted">
        <span class="min-w-0 flex-1 break-all">{{ file.path }}</span>
        <span
          class="shrink-0 tabular-nums"
          aria-hidden="true"
        ><span class="text-success">+{{ file.added }}</span> <span class="text-error">−{{ file.removed }}</span></span>
      </h4>
      <table class="w-full table-fixed border-collapse font-mono text-xs leading-5 [font-variant-ligatures:none]">
        <colgroup>
          <col class="w-8 sm:w-10">
          <col>
        </colgroup>
        <tbody
          v-for="(hunk, h) in file.hunks"
          :key="h"
        >
          <tr>
            <td
              colspan="2"
              class="bg-info/8 px-2 py-0.5 text-info"
            >
              {{ hunk.header }}
            </td>
          </tr>
          <tr
            v-for="(row, index) in hunk.rows"
            :key="index"
            :class="ROW_TONE[row.kind]"
            :data-kind="row.kind"
          >
            <td
              class="pe-1.5 text-end align-top tabular-nums select-none"
              :class="NUMBER_TONE[row.kind]"
            >
              {{ row.new ?? row.old }}
            </td>
            <td class="pe-2 align-top whitespace-pre-wrap text-default [overflow-wrap:anywhere]">
              <span
                class="inline-block w-4 text-center select-none"
                :class="NUMBER_TONE[row.kind]"
                aria-hidden="true"
              >{{ SIGN[row.kind] }}</span>{{ row.text }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
