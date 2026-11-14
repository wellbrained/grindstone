<script setup lang="ts">
import type { ReviewPlaySession } from '~/composables/useReviewPlay'
import { placeShort } from '~/utils/review-view'

// Your comments in the level panel (docs/features/ui.md, "Working with AI play page"): one line each (where, what kind,
// and after a review what it found), a click takes you to it in the diff; and Finish your review, which takes you to
// the review box at the end of the pull request.
const props = defineProps<{ play: ReviewPlaySession }>()
const emit = defineEmits<{ review: [] }>()

const { t } = useI18n()
const { comments, statusOf } = props.play

function show(id: number) {
  const card = document.getElementById(`review-comment-${id}`)
  if (!card) return
  card.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  card.focus({ preventScroll: true })
}

/** What a comment's line says after a review: found, right lines but another kind, too wide, a false alarm; nothing before. */
function verdictOf(id: number): { icon: string, tone: string, text: string } | null {
  const comment = comments.value.find(each => each.id === id)
  const status = comment ? statusOf(comment) : null
  if (status?.kind !== 'sent') return null
  if (status.feedback.found.length) return { icon: 'i-lucide-circle-check', tone: 'text-success', text: t('review.list.found') }
  if (status.feedback.near.length) return { icon: 'i-lucide-circle-alert', tone: 'text-warning', text: t('review.list.near') }
  if (status.feedback.wide.length) return { icon: 'i-lucide-circle-alert', tone: 'text-warning', text: t('review.list.wide') }
  return { icon: 'i-lucide-circle-minus', tone: 'text-muted', text: t('review.list.falseAlarm') }
}
</script>

<template>
  <section aria-labelledby="review-comments-heading">
    <h2
      id="review-comments-heading"
      class="flex items-baseline justify-between gap-2 font-mono text-xs font-medium text-muted"
    >
      {{ t('review.list.title') }}
      <span class="tabular-nums">{{ comments.length }}</span>
    </h2>
    <p
      v-if="!comments.length"
      class="mt-2 text-sm text-muted"
    >
      {{ t('review.list.empty') }}
    </p>
    <ul
      v-else
      class="mt-2 space-y-1"
      data-testid="comment-list"
    >
      <li
        v-for="comment in comments"
        :key="comment.id"
      >
        <button
          type="button"
          class="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-start text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
          @click="show(comment.id)"
        >
          <!-- a long path (server/menu-routes.js:12) wraps instead of pushing the category under the verdict -->
          <span class="max-w-[45%] shrink-0 font-mono text-xs leading-5 break-all text-muted">{{ placeShort(comment) }}</span>
          <span class="min-w-0 flex-1">
            <span class="font-medium text-highlighted">{{ t(`review.category.${comment.category}`) }}</span>
            <span
              v-if="comment.text"
              class="line-clamp-1 text-toned"
            >{{ comment.text }}</span>
          </span>
          <span
            v-if="verdictOf(comment.id)"
            class="flex shrink-0 items-center gap-1 text-xs leading-5"
            :class="verdictOf(comment.id)!.tone"
          >
            <UIcon
              :name="verdictOf(comment.id)!.icon"
              class="size-3.5"
            />
            {{ verdictOf(comment.id)!.text }}
          </span>
        </button>
      </li>
    </ul>
    <UButton
      class="mt-2"
      size="sm"
      color="neutral"
      icon="i-lucide-arrow-down"
      :label="t('review.list.finish')"
      data-testid="finish-review"
      @click="emit('review')"
    />
  </section>
</template>
