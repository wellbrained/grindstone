<script setup lang="ts">
import type { ReviewPlaySession } from '~/composables/useReviewPlay'

// Sous's pull request (docs/features/ui.md, "Working with AI play page"), GitHub-like and without its chrome: the title
// with its number and branches, Sous's description and claims as numbered lines (ReviewFile, so a comment can sit on a
// claim), the issue it says it fixes, the diff file by file (ReviewFile) with your comments in it, and at the end the
// review box (ReviewSubmit). Everything Sous wrote is text: `backticks` become code, nothing else is markup.
const props = defineProps<{ play: ReviewPlaySession }>()

const { t } = useI18n()
const { level, diff, description } = props.play
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

    <!-- a finger has no Shift and no drag: on touch screens a comment is on the line you tap -->
    <p class="text-xs text-muted">
      <span class="pointer-coarse:hidden">{{ t('review.diff.howTo') }}</span>
      <span
        class="hidden pointer-coarse:inline"
        data-testid="how-to-touch"
      >{{ t('review.diff.howToTouch') }}</span>
    </p>

    <!-- Sous's description, numbered like a file: a comment can point at a claim -->
    <ReviewFile
      :play="play"
      :file="description"
    />

    <!-- the issue the pull request says it fixes: Sous didn't write it, so it is not a place to comment -->
    <section
      v-if="pr.fixes"
      class="rounded-lg border border-default"
      :aria-label="t('review.pr.linked', { number: pr.fixes.number })"
      data-testid="linked-issue"
    >
      <header class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-default px-3 py-2 text-xs text-muted">
        <UIcon
          name="i-lucide-circle-dot"
          class="size-3.5 text-success"
        />
        <span>{{ t('review.pr.linkedTitle') }}</span>
        <span class="font-medium text-highlighted">{{ pr.fixes.title }} <span class="font-mono font-normal text-muted">#{{ pr.fixes.number }}</span></span>
        <span>{{ t('review.pr.openedBy', { author: pr.fixes.author }) }}</span>
      </header>
      <div class="space-y-2 px-3 py-3 text-sm text-default">
        <p
          v-for="(paragraph, index) in pr.fixes.body"
          :key="index"
        >
          <InlineText :text="paragraph" />
        </p>
      </div>
    </section>

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
