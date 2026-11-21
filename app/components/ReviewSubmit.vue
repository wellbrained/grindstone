<script setup lang="ts">
import { MAX_SUMMARY } from '#shared/levels'
import type { Verdict } from '#shared/levels'
import type { ReviewPlaySession } from '~/composables/useReviewPlay'

// The review box at the end of the pull request (docs/features/ui.md, "Working with AI play page"): a summary (a
// verdict task's one-line reason, needed to send it), Approve and Request changes. Sending checks the review: what it
// found shows under each comment, and here what the last review came to (not solved yet: you can keep reviewing and
// send it again). Grindstone never reads what you write: the lines and categories decide. A steer level (chapter 7)
// says which round it is; a request for changes before the last round is answered by Sous's commit (the timeline
// shows it), one without a comment is refused, and an approval is right only once nothing is left.
const props = defineProps<{ play: ReviewPlaySession }>()

const { t } = useI18n()
const { store, sent, comments, needsReason, reasonMissing, submit, session, level, round, refused } = props.play
const rounds = level.steer?.rounds ?? null

/** A steer level's round, in words: what a request for changes does now. */
const roundNote = computed(() => {
  if (rounds === null) return null
  if (round.value >= rounds) return t('review.steer.lastRound', { round: round.value, rounds })
  return t(round.value === 1 ? 'review.steer.firstRound' : 'review.steer.nextRound', { round: round.value, rounds })
})

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
  const verdict = t(`review.verdict.${result.verdict}`)
  if (level.steer) return steerOutcome(result)
  const total = level.issues.length
  if (result.solved) return { tone: 'success', text: t('review.result.solved', { verdict }) }
  const parts: string[] = []
  // a verdict task does not say how many problems there are (that is the question)
  if (total > 0 && !needsReason) parts.push(t('review.result.found', { found: result.found.length, total }))
  if (result.flaggedApproval) parts.push(t('review.result.flagged'))
  else if (!result.verdictRight) parts.push(t('review.result.verdictWrong', { verdict }))
  if (result.falseAlarms > 0) parts.push(t('review.result.falseAlarms', result.falseAlarms))
  return { tone: 'warning', text: `${parts.join(' ')} ${t('review.result.again')}` }
})

/** What a steer level's last review came to: an approval (right, too early, or with comments), or a request in the last round. */
function steerOutcome(result: NonNullable<typeof sent.value>['result']) {
  // only an approval solves a steer level: a request for changes in the last round finds problems Sous won't fix
  if (result.verdict === 'approve' && result.solved) return { tone: 'success', text: t('review.steer.solved') }
  // the round's open problems: found and missed together
  const open = result.found.length + result.missed.length
  const parts: string[] = []
  if (result.verdict === 'approve') {
    if (open > 0) parts.push(t('review.steer.left', open))
    else if (result.flaggedApproval) parts.push(t('review.result.flagged'))
  } else {
    if (open > 0) parts.push(t('review.result.found', { found: result.found.length, total: open }))
    parts.push(t('review.steer.noMoreRounds'))
  }
  if (result.falseAlarms > 0) parts.push(t('review.result.falseAlarms', result.falseAlarms))
  const out = rounds !== null && round.value >= rounds && (open > 0 || result.verdict === 'request-changes')
  return { tone: 'warning', text: `${parts.join(' ')} ${out ? t('review.steer.reset') : t('review.result.again')}` }
}

const VERDICTS: { id: Verdict, icon: string, tone: string }[] = [
  { id: 'approve', icon: 'i-lucide-check', tone: 'text-success' },
  { id: 'request-changes', icon: 'i-lucide-file-diff', tone: 'text-error' }
]
/** The verdict of the last review you sent (its button says "sent"). */
const sentVerdict = computed(() => sent.value?.result.verdict ?? null)

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
    <p
      v-if="roundNote"
      class="text-xs text-muted"
      data-testid="steer-round-note"
    >
      {{ roundNote }}
    </p>
    <!-- the verdicts: neutral buttons, the colour only on their icons; the one your last review sent says so in words -->
    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="verdict in VERDICTS"
        :key="verdict.id"
        color="neutral"
        :icon="verdict.icon"
        :ui="{ leadingIcon: verdict.tone }"
        :data-testid="verdict.id"
        :data-sent="sentVerdict === verdict.id || undefined"
        @click="send(verdict.id)"
      >
        {{ t(`review.verdict.${verdict.id}`) }}<span
          v-if="sentVerdict === verdict.id"
          class="text-xs font-normal text-muted"
        > · {{ t('review.submit.sent') }}</span>
      </UButton>
    </div>
    <p
      v-if="refused === 'comments'"
      class="text-xs text-error"
      data-testid="steer-needs-comment"
    >
      {{ t('review.steer.needsComment') }}
    </p>
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
