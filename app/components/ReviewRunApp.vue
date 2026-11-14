<script setup lang="ts">
import type { DebugLevel, SourceLine } from '#shared/levels'
import type { RunSide } from '~/utils/review-run'

// One load of the pull request's app (ReviewRun): the Debugging track's App and Console, unchanged, on a play session
// that only runs (`useDebuggingPlay(level, { runOnly: true })`: the sealed frame, the bridge and its port, Reload; no
// goals, nothing recorded). A new instance per side, so switching starts the app from scratch. A file:line link in the
// Console (which opens Code in the Debugging track) is handed up: Run the PR shows that line in the diff.
const props = defineProps<{
  level: DebugLevel
  side: RunSide
}>()
const emit = defineEmits<{ line: [line: SourceLine] }>()

const { t } = useI18n()
const play = useDebuggingPlay(props.level, { runOnly: true })
// every link click sets a new mark, also for the same line
watch(play.mark, (mark) => {
  if (mark) emit('line', { path: mark.path, line: mark.line })
})
</script>

<template>
  <div
    class="flex min-h-0 flex-col gap-2"
    :data-run-side="side"
  >
    <p class="text-xs text-muted">
      {{ t(`review.run.running.${side}`) }}
    </p>
    <div class="min-h-56 flex-[1.4_1_0]">
      <DebuggingApp :play="play" />
    </div>
    <DebuggingConsole
      :play="play"
      class="min-h-40 flex-[1_1_0]"
    />
  </div>
</template>
