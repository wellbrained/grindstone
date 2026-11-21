<script setup lang="ts">
import type { ReviewLevel } from '#shared/levels'
import { issuePlaces } from '~/utils/review-view'

// What was wrong in the pull request, in the debrief after the lesson (DebriefDialog's `details` slot): each planted
// issue, where (the description's lines that state it, then the code), with the claim it breaks and why.
defineProps<{ level: ReviewLevel }>()

const { t } = useI18n()

/** Where it was, in the page's order: 'description:3 · summary.js:12'. */
const where = (issue: ReviewLevel['issues'][number]) => issuePlaces(issue).join(' · ')
</script>

<template>
  <section
    v-if="level.issues.length"
    class="mt-5"
    aria-labelledby="debrief-issues-heading"
  >
    <h3
      id="debrief-issues-heading"
      class="text-sm font-semibold text-highlighted"
    >
      {{ t('debrief.issues') }}
    </h3>
    <ul
      class="mt-2 space-y-2 text-sm"
      data-testid="debrief-issues"
    >
      <li
        v-for="issue in level.issues"
        :key="issue.id"
        class="rounded-lg border border-default p-2.5"
      >
        <p class="font-medium text-highlighted">
          <span class="me-1.5 font-mono text-xs font-normal text-muted">{{ where(issue) }}</span><InlineText :text="issue.title" />
        </p>
        <p class="mt-1 text-toned">
          <InlineText :text="issue.explanation" />
        </p>
      </li>
    </ul>
  </section>
</template>
