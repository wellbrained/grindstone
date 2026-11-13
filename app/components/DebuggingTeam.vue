<script setup lang="ts">
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// The colleagues' messages in an Incidents level (docs/features/ui.md, "Debugging play page"): the report the level
// opens with, then what a colleague adds after a while or after a fix that did not work (colleague events, on generic
// triggers after a counted action, never a timer). A polite live region: a new message is read out where you are; the
// focus never moves. Text only.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { messages } = props.play
</script>

<template>
  <section
    v-if="messages.length"
    aria-labelledby="team-heading"
    data-testid="team"
  >
    <h2
      id="team-heading"
      class="font-mono text-xs font-medium text-muted"
    >
      {{ t('debugging.team.heading') }}
    </h2>
    <ol
      class="mt-2 space-y-2"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      :aria-label="t('debugging.team.label')"
    >
      <li
        v-for="message in messages"
        :key="message.id"
        class="rounded-lg border px-3 py-2 text-sm text-toned"
        :class="message.id === 'report' ? 'border-default bg-elevated' : 'border-info/40 bg-info/8'"
        :data-message="message.id"
        data-testid="team-message"
      >
        <span class="me-1 font-medium text-highlighted">{{ message.author }}:</span>
        <InlineText :text="message.text" />
      </li>
    </ol>
  </section>
</template>
