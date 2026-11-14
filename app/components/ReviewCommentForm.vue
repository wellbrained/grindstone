<script setup lang="ts">
import { CATEGORIES, MAX_COMMENT_TEXT } from '#shared/levels'
import type { Category } from '#shared/levels'

// The form of a review comment (docs/features/ui.md, "Working with AI play page"), new or being edited: which lines it
// is on, what kind of problem (the category decides what it finds; the text is for Sous and is never read), Save and
// Cancel. The category takes the focus when it opens; Escape cancels, Ctrl/Cmd+Enter saves.
defineProps<{
  /** The lines it is on, as words ('lines 10 to 13'). */
  lines: string
  saveLabel: string
}>()

const category = defineModel<Category>('category', { required: true })
const text = defineModel<string>('text', { required: true })
const emit = defineEmits<{ save: [], cancel: [] }>()

const { t } = useI18n()
const id = useId()

const select = useTemplateRef<HTMLSelectElement>('select')
onMounted(() => select.value?.focus())

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    emit('save')
  }
}
</script>

<template>
  <form
    class="space-y-2 rounded-lg border border-primary/50 bg-elevated p-3 text-sm"
    :aria-label="t('review.comment.formLabel', { lines })"
    @submit.prevent="emit('save')"
    @keydown="onKeydown"
  >
    <p class="text-xs text-muted">
      {{ t('review.comment.on', { lines }) }}
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <label
        :for="`${id}-category`"
        class="text-xs text-muted"
      >{{ t('review.comment.category') }}</label>
      <select
        :id="`${id}-category`"
        ref="select"
        v-model="category"
        class="min-w-0 cursor-pointer rounded-md border border-default bg-default px-2 py-1 text-sm text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
        data-testid="comment-category"
      >
        <option
          v-for="each in CATEGORIES"
          :key="each"
          :value="each"
        >
          {{ t(`review.category.${each}`) }}
        </option>
      </select>
      <span class="min-w-0 flex-1 text-xs text-dimmed">{{ t(`review.categoryHelp.${category}`) }}</span>
    </div>
    <UTextarea
      v-model="text"
      :aria-label="t('review.comment.text')"
      :placeholder="t('review.comment.placeholder')"
      :maxlength="MAX_COMMENT_TEXT"
      :rows="2"
      autoresize
      class="w-full"
      data-testid="comment-text"
    />
    <div class="flex flex-wrap justify-end gap-2">
      <UButton
        size="sm"
        color="neutral"
        :label="t('review.comment.cancel')"
        @click="emit('cancel')"
      />
      <UButton
        type="submit"
        size="sm"
        color="primary"
        variant="solid"
        :label="saveLabel"
        data-testid="comment-save"
      />
    </div>
  </form>
</template>
