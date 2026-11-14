<script setup lang="ts">
import type { ReviewComment } from '#shared/levels'
import type { ReviewPlaySession } from '~/composables/useReviewPlay'
import { placeShort, placeText } from '~/utils/review-view'

// One comment of your review in the diff (docs/features/ui.md, "Working with AI play page"): its category, its lines,
// what you wrote, Edit and Delete; once a review was sent with it, what that review found here ("Found: …", "Right
// lines, another kind of problem", "covers too much: narrow it down", "Nothing wrong here, because …"). Edit opens the
// same form in place.
const props = defineProps<{
  play: ReviewPlaySession
  comment: ReviewComment
}>()

const { t } = useI18n()
const { store, statusOf, issueTitle, startEdit, saveEdit, cancelEdit, removeComment } = props.play

const editing = computed(() => store.value.editing?.id === props.comment.id ? store.value.editing : null)
const status = computed(() => statusOf(props.comment))
const lines = computed(() => placeText(t, props.comment))

const card = useTemplateRef<HTMLElement>('card')
const editButton = useTemplateRef<{ $el: HTMLElement }>('editButton')

function save() {
  saveEdit()
  nextTick(() => card.value?.focus())
}
function cancel() {
  cancelEdit()
  nextTick(() => editButton.value?.$el.focus())
}
function remove() {
  // the focus goes to the file's rows (the card is gone)
  const file = card.value?.closest('[data-file]')
  removeComment(props.comment.id)
  nextTick(() => file?.querySelector<HTMLElement>('[data-testid="diff-number"][tabindex="0"]')?.focus())
}
</script>

<template>
  <ReviewCommentForm
    v-if="editing"
    v-model:category="editing.category"
    v-model:text="editing.text"
    :lines="lines"
    :save-label="t('review.comment.save')"
    data-testid="comment-edit-form"
    @save="save"
    @cancel="cancel"
  />
  <article
    v-else
    :id="`review-comment-${comment.id}`"
    ref="card"
    tabindex="-1"
    class="space-y-1.5 rounded-lg border border-default bg-elevated p-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
    :aria-label="t('review.comment.label', { category: t(`review.category.${comment.category}`), lines })"
    :data-comment="placeShort(comment)"
    data-testid="comment"
  >
    <header class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        class="rounded-sm border border-default px-1.5 text-xs font-medium text-highlighted"
        data-testid="comment-category-badge"
      >{{ t(`review.category.${comment.category}`) }}</span>
      <span class="font-mono text-xs text-muted">{{ placeShort(comment) }}</span>
      <span class="ms-auto flex gap-1">
        <UButton
          ref="editButton"
          size="xs"
          color="neutral"
          icon="i-lucide-pencil"
          :label="t('review.comment.edit')"
          :aria-label="t('review.comment.editLabel', { lines })"
          @click="startEdit(comment.id)"
        />
        <UButton
          size="xs"
          color="neutral"
          icon="i-lucide-trash-2"
          :label="t('review.comment.delete')"
          :aria-label="t('review.comment.deleteLabel', { lines })"
          data-testid="comment-delete"
          @click="remove"
        />
      </span>
    </header>
    <p
      v-if="comment.text"
      class="break-words whitespace-pre-wrap text-default"
    >
      {{ comment.text }}
    </p>
    <p
      v-else
      class="text-xs text-dimmed"
    >
      {{ t('review.comment.noText') }}
    </p>

    <!-- what the review it was sent with found here -->
    <template v-if="status.kind === 'sent'">
      <p
        v-for="id in status.feedback.found"
        :key="id"
        class="flex items-start gap-1.5 text-success"
        data-testid="comment-found"
      >
        <UIcon
          name="i-lucide-circle-check"
          class="mt-0.5 size-4 shrink-0"
        />
        <span><span class="font-medium">{{ t('review.feedback.found') }}</span> <InlineText :text="issueTitle(id)" /></span>
      </p>
      <p
        v-if="status.feedback.near.length"
        class="flex items-start gap-1.5 text-warning"
        data-testid="comment-near"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="mt-0.5 size-4 shrink-0"
        />
        <span>{{ t('review.feedback.near', { category: t(`review.category.${comment.category}`) }) }}</span>
      </p>
      <p
        v-if="status.feedback.wide.length"
        class="flex items-start gap-1.5 text-warning"
        data-testid="comment-wide"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="mt-0.5 size-4 shrink-0"
        />
        <span>{{ t('review.feedback.wide') }}</span>
      </p>
      <p
        v-if="status.feedback.falseAlarm"
        class="flex items-start gap-1.5 text-toned"
        data-testid="comment-false-alarm"
      >
        <UIcon
          name="i-lucide-circle-minus"
          class="mt-0.5 size-4 shrink-0 text-muted"
        />
        <span><span class="font-medium text-highlighted">{{ t('review.feedback.falseAlarm') }}</span> <InlineText :text="status.feedback.why ?? (status.feedback.broad ? t('review.feedback.broad') : t('review.feedback.nothingHere'))" /></span>
      </p>
    </template>
    <p
      v-else-if="status.kind === 'changed'"
      class="text-xs text-dimmed"
    >
      {{ t('review.feedback.changed') }}
    </p>
  </article>
</template>
