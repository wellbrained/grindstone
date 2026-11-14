<script setup lang="ts">
import type { ReviewPlaySession } from '~/composables/useReviewPlay'
import type { SousReply } from '~/utils/steer-view'
import { steerCommits } from '~/utils/steer-view'

// A steer level's rounds so far (ADR 0008, chapter 7; docs/features/ui.md "Working with AI play page"), between Sous's
// description and the diff, like a pull request's conversation: for each review that asked for changes, your comments
// with Sous's answer to each, then the commit Sous pushed (its id and size) and what it changed, the latest open. The
// pull request below is the round you review now.
const props = defineProps<{ play: ReviewPlaySession }>()

const { t } = useI18n()
const { level, commits } = props.play

const rounds = computed(() => steerCommits(level, commits.value))

function replyText(reply: SousReply, category: string): string {
  if (reply.kind === 'said') return reply.text
  return t(`review.steer.reply.${reply.kind}`, { category: t(`review.category.${category}`) })
}
</script>

<template>
  <section
    class="space-y-3"
    aria-labelledby="steer-heading"
    data-testid="steer-timeline"
  >
    <h3
      id="steer-heading"
      class="text-sm font-semibold text-highlighted"
    >
      {{ t('review.steer.title') }}
    </h3>
    <ol class="space-y-3">
      <li
        v-for="(commit, index) in rounds"
        :id="`steer-round-${commit.round}`"
        :key="commit.id"
        tabindex="-1"
        class="space-y-2 focus-visible:outline-2 focus-visible:outline-primary"
        :data-round="commit.round"
        data-testid="steer-round"
      >
        <!-- your review -->
        <div class="rounded-lg border border-default">
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-default px-3 py-2 text-xs text-muted">
            <UIcon
              name="i-lucide-file-diff"
              class="size-3.5 text-error"
            />
            <span class="font-medium text-highlighted">{{ t('review.steer.requested', { round: commit.round }) }}</span>
            <span class="font-mono tabular-nums">{{ t('review.submit.comments', commit.review.comments.length) }}</span>
          </header>
          <p
            v-if="commit.review.summary"
            class="border-b border-default px-3 py-2 text-sm break-words whitespace-pre-wrap text-default"
          >
            {{ commit.review.summary }}
          </p>
          <ul class="divide-y divide-default">
            <li
              v-for="each in commit.replies"
              :key="each.comment.id"
              class="space-y-1.5 px-3 py-2 text-sm"
              :data-comment="each.place"
              data-testid="steer-reply"
            >
              <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="rounded-sm border border-default px-1.5 text-xs font-medium text-highlighted">{{ t(`review.category.${each.comment.category}`) }}</span>
                <span class="font-mono text-xs text-muted">{{ each.place }}</span>
                <span
                  v-if="each.comment.text"
                  class="min-w-0 basis-full break-words whitespace-pre-wrap text-default"
                >{{ each.comment.text }}</span>
              </p>
              <p
                v-for="(reply, at) in each.replies"
                :key="at"
                class="flex items-start gap-2 text-toned"
                data-testid="steer-sous"
              >
                <span
                  class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accented font-mono text-[11px] font-semibold text-highlighted"
                  aria-hidden="true"
                >S</span>
                <span class="min-w-0"><span class="sr-only">Sous: </span><InlineText :text="replyText(reply, each.comment.category)" /></span>
              </p>
            </li>
          </ul>
        </div>

        <!-- Sous's commit -->
        <div class="rounded-lg border border-default bg-elevated">
          <p class="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs text-muted">
            <UIcon
              name="i-lucide-git-commit-horizontal"
              class="size-4 text-highlighted"
            />
            <span>{{ t('review.steer.pushed') }}</span>
            <code
              class="rounded-sm bg-accented px-1 font-mono text-highlighted"
              data-testid="steer-commit-id"
            >{{ commit.id }}</code>
            <span class="font-mono tabular-nums"><span class="text-success">+{{ commit.added }}</span> <span class="text-error">−{{ commit.removed }}</span></span>
          </p>
          <details
            class="border-t border-default px-3 py-2"
            :open="index === rounds.length - 1"
          >
            <summary class="cursor-pointer text-xs font-medium text-highlighted">
              {{ t('review.steer.changes', { round: commit.round + 1 }) }}
            </summary>
            <div class="mt-2">
              <SteerCommitDiff :changes="commit.changes" />
            </div>
          </details>
        </div>
      </li>
    </ol>
  </section>
</template>
