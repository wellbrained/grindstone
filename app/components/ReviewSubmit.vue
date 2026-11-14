<script setup lang="ts">
import { MAX_SUMMARY } from '#shared/levels'
import type { Verdict } from '#shared/levels'
import type { ReviewPlaySession } from '~/composables/useReviewPlay'

// The review box at the end of the pull request (docs/features/ui.md, "Working with AI play page"): a summary (a
// verdict task's one-line reason, needed to send it), Approve and Request changes. Sending checks the review: what it
// found shows under each comment, and here what the last review came to (not solved yet: you can keep reviewing and
// send it again). Grindstone never reads what you write: the lines and categories decide.
const props = defineProps<{ play: ReviewPlaySession }>()

const { t } = useI18n()
const { store, sent, comments, needsReason, reasonMissing, submit, session, level } = props.play

const id = useId()
const reasonMissingNow = computed(() => needsReason && reasonMissing.value && !store.value.summary.trim())

function send(verdict: Verdict) {
  submit(verdict)
  if (reasonMissingNow.value) nextTick(() => document.getElementById(`${id}-summary`)?.focus())
}

/** What the last review you sent came to, in words. */
const outcome = computed(() => {
  const review = sent.value
  if (!review) return null
  const result = review.result
  const total = level.issues.length
  const verdict = t(`review.verdict.${result.verdict}`)
  if (result.solved) return { tone: 'success', text: t('review.result.solved', { verdict }) }
  const parts: string[] = []
  // a verdict task does not say how many problems there are (that is the question)
  if (total > 0 && !needsReason) parts.push(t('review.result.found', { found: result.found.length, total }))
  if (result.flaggedApproval) parts.push(t('review.result.flagged'))
  else if (!result.verdictRight) parts.push(t('review.result.verdictWrong', { verdict }))
  if (result.falseAlarms > 0) parts.push(t('review.result.falseAlarms', result.falseAlarms))
  return { tone: 'warning', text: `${parts.join(' ')} ${t('review.result.again')}` }
})

const box = useTemplateRef<HTMLElement>('box')
defineExpose({ focus: () => box.value?.focus() })
</script>

<template>
  <section
    ref="box"
    tabindex="-1"
    class="space-y-3 rounded-lg border border-default bg-elevated p-3 focus-visible:outline-2 focus-visible:outline-primary"
    aria-labelledby="review-box-heading"
    data-testid="review-box"
  >
    <h3
      id="review-box-heading"
      class="text-sm font-semibold text-highlighted"
    >
      {{ t('review.submit.title') }}
      <span class="ms-1 font-mono text-xs font-normal text-muted tabular-nums">{{ t('review.submit.comments', comments.length) }}</span>
    </h3>
    <div>
      <label
        :for="`${id}-summary`"
        class="text-xs text-muted"
      >{{ needsReason ? t('review.submit.reason') : t('review.submit.summary') }}</label>
      <UTextarea
        :id="`${id}-summary`"
        v-model="store.summary"
        :placeholder="needsReason ? t('review.submit.reasonPlaceholder') : t('review.submit.summaryPlaceholder')"
        :maxlength="MAX_SUMMARY"
        :rows="2"
        autoresize
        :color="reasonMissingNow ? 'error' : undefined"
        :highlight="reasonMissingNow"
        :aria-invalid="reasonMissingNow || undefined"
        :aria-describedby="reasonMissingNow ? `${id}-reason-missing` : undefined"
        class="mt-1 w-full"
        data-testid="review-summary"
      />
      <p
        v-if="reasonMissingNow"
        :id="`${id}-reason-missing`"
        class="mt-1 text-xs text-error"
        data-testid="reason-missing"
      >
        {{ t('review.submit.reasonMissing') }}
      </p>
      <p
        v-else
        class="mt-1 text-xs text-dimmed"
      >
        {{ t('review.submit.notRead') }}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <UButton
        color="success"
        icon="i-lucide-check"
        :label="t('review.verdict.approve')"
        data-testid="approve"
        @click="send('approve')"
      />
      <UButton
        color="error"
        icon="i-lucide-file-diff"
        :label="t('review.verdict.request-changes')"
        data-testid="request-changes"
        @click="send('request-changes')"
      />
    </div>
    <p
      role="status"
      class="text-sm empty:hidden"
      :class="outcome?.tone === 'success' ? 'text-success' : 'text-toned'"
      data-testid="review-outcome"
    >
      <template v-if="outcome">
        <span class="font-medium text-highlighted">{{ t('review.result.sent', { n: session.state.reviews }) }}</span>
        {{ outcome.text }}
      </template>
    </p>
  </section>
</template>
