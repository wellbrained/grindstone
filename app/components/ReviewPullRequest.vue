<script setup lang="ts">
import type { ReviewPlaySession } from '~/composables/useReviewPlay'

// Sous's pull request (docs/features/ui.md, "Working with AI play page"), GitHub-like and without its chrome: the title
// with its number and branches, Sous's description and claims, the diff file by file (ReviewFile) with your comments
// in it, and at the end the review box (ReviewSubmit). Everything Sous wrote is text: `backticks` become code, nothing
// else is markup.
const props = defineProps<{ play: ReviewPlaySession }>()

const { t } = useI18n()
const { level, diff } = props.play
const pr = level.pr

const added = diff.reduce((sum, file) => sum + file.added, 0)
const removed = diff.reduce((sum, file) => sum + file.removed, 0)

const review = useTemplateRef<{ focus: () => void }>('review')
defineExpose({ focusReview: () => review.value?.focus() })
</script>

<template>
  <article
    :aria-label="t('review.pr.label', { number: pr.number, title: pr.title })"
    class="space-y-4"
    data-testid="pull-request"
  >
    <header class="space-y-1.5">
      <h2 class="text-xl font-semibold text-balance text-highlighted">
        {{ pr.title }} <span class="font-mono font-normal text-muted">#{{ pr.number }}</span>
      </h2>
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span class="inline-flex items-center gap-1 rounded-full border border-success/40 px-2 py-0.5 text-xs text-success">
          <UIcon
            name="i-lucide-git-pull-request"
            class="size-3.5"
          />
          {{ t('review.pr.open') }}
        </span>
        <span>
          <span class="font-medium text-highlighted">Sous</span>
          {{ t('review.pr.wants') }}
          <code class="rounded-sm bg-accented px-1 font-mono text-xs text-highlighted">{{ pr.branch }}</code>
          {{ t('review.pr.into') }}
          <code class="rounded-sm bg-accented px-1 font-mono text-xs text-highlighted">main</code>
        </span>
      </p>
      <p class="font-mono text-xs text-muted tabular-nums">
        <span aria-hidden="true">{{ t('review.pr.files', diff.length) }} · <span class="text-success">+{{ added }}</span> <span class="text-error">−{{ removed }}</span></span>
        <span class="sr-only">{{ t('review.pr.filesLong', { files: t('review.pr.files', diff.length), added, removed }) }}</span>
      </p>
    </header>

    <section
      class="rounded-lg border border-default bg-elevated"
      :aria-label="t('review.pr.description')"
    >
      <p class="flex items-center gap-2 border-b border-default px-3 py-2 text-xs text-muted">
        <span
          class="grid size-5 place-items-center rounded-full bg-accented font-mono text-[11px] font-semibold text-highlighted"
          aria-hidden="true"
        >S</span>
        <span><span class="font-medium text-highlighted">Sous</span> · {{ t('review.pr.assistant') }}</span>
      </p>
      <div class="space-y-2 px-3 py-3 text-sm text-default">
        <p
          v-for="(paragraph, index) in pr.description"
          :key="index"
        >
          <InlineText :text="paragraph" />
        </p>
        <ul
          v-if="pr.claims.length"
          class="list-disc space-y-0.5 ps-5 text-toned"
          data-testid="pr-claims"
        >
          <li
            v-for="(claim, index) in pr.claims"
            :key="index"
          >
            <InlineText :text="claim" />
          </li>
        </ul>
      </div>
    </section>

    <!-- a finger has no Shift and no drag: on touch screens a comment is on the line you tap -->
    <p class="text-xs text-muted">
      <span class="pointer-coarse:hidden">{{ t('review.diff.howTo') }}</span>
      <span
        class="hidden pointer-coarse:inline"
        data-testid="how-to-touch"
      >{{ t('review.diff.howToTouch') }}</span>
    </p>

    <ReviewFile
      v-for="file in diff"
      :key="file.path"
      :play="play"
      :file="file"
    />

    <ReviewSubmit
      ref="review"
      :play="play"
    />
  </article>
</template>
