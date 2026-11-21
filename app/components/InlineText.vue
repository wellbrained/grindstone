<script setup lang="ts">
import { codeBreaks, inlineParts } from '~/utils/inline-text'

// Level text (story, debrief, goals, hints, predictions): `backticks` as monospace code chips, **strong** and *emphasis*
// as elements (app/utils/inline-text.ts; never v-html). A long chip wraps after a slash or a dot first, else anywhere,
// so it never pushes a narrow column wider.
const props = defineProps<{ text: string }>()

const parts = computed(() => inlineParts(props.text))
</script>

<template>
  <span>
    <template
      v-for="(part, index) in parts"
      :key="index"
    >
      <code
        v-if="part.kind === 'code'"
        class="rounded-sm bg-accented box-decoration-clone px-1 py-0.5 font-mono text-[0.9em] wrap-anywhere text-highlighted"
      ><template
        v-for="(piece, at) in codeBreaks(part.text)"
        :key="at"
      ><wbr v-if="at > 0">{{ piece }}</template></code>
      <strong
        v-else-if="part.kind === 'strong'"
        class="font-semibold text-highlighted"
      >{{ part.text }}</strong>
      <em v-else-if="part.kind === 'em'">{{ part.text }}</em>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
