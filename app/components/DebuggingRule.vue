<script setup lang="ts">
import type { RuleView, SourceLine } from '#shared/levels'

// One rule in the Elements panel (docs/features/ui.md, "Elements"): its media or supports conditions, its selector list
// (the selectors that matched highlighted, the others dimmed) with its specificity, where it is written (a link that
// opens that line in Code; in a find task the link is an answer), and its declarations: struck through what lost or what
// the browser refuses, a note for a variable nothing defines; each declaration opens its own line too. All text.
const props = defineProps<{
  rule: RuleView
  /** What a link says to a screen reader (open the line, or answer with it in a find task). */
  linkLabel: (line: SourceLine) => string
}>()

const emit = defineEmits<{ open: [line: SourceLine] }>()

const { t } = useI18n()

const where = (line: SourceLine) => `${line.path}:${line.line}`
const LINK = 'shrink-0 rounded-sm font-sans text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary'
const specificityText = computed(() => props.rule.specificity
  ? t('debugging.elements.specificity', { ids: props.rule.specificity[0], classes: props.rule.specificity[1], types: props.rule.specificity[2] })
  : '')
</script>

<template>
  <div
    class="mb-2 rounded-md border border-(--app-terminal-border) px-2 py-1 font-mono text-xs leading-5"
    data-testid="elements-rule"
    :data-selector="rule.selector"
  >
    <p
      v-for="(condition, index) in rule.conditions"
      :key="index"
      class="flex items-baseline justify-between gap-2 text-muted"
      data-testid="elements-condition"
    >
      <span class="min-w-0 break-words">@{{ condition.kind }} {{ condition.text }}</span>
      <button
        type="button"
        :class="LINK"
        :aria-label="linkLabel(condition.source)"
        data-testid="elements-condition-link"
        @click="emit('open', condition.source)"
      >
        {{ where(condition.source) }}
      </button>
    </p>
    <p class="flex items-baseline justify-between gap-2">
      <span class="min-w-0 break-words">
        <span
          v-if="rule.origin === 'inline'"
          class="text-toned"
        >element.style</span>
        <template
          v-for="(each, index) in rule.selectors"
          v-else
          :key="index"
        ><span :class="each.matched ? 'text-highlighted' : 'text-dimmed'">{{ each.text }}</span><span
          v-if="index < rule.selectors.length - 1"
          class="text-dimmed"
        >, </span></template>
        <span class="text-dimmed"> {</span>
        <span
          v-if="rule.specificity"
          class="ms-1.5 font-sans text-[10px] text-dimmed tabular-nums"
          aria-hidden="true"
        >{{ rule.specificity.join(' · ') }}</span>
        <span
          v-if="rule.specificity"
          class="sr-only"
        >, {{ specificityText }}</span>
      </span>
      <button
        v-if="rule.source"
        type="button"
        :class="LINK"
        :aria-label="linkLabel(rule.source)"
        data-testid="elements-rule-link"
        @click="emit('open', rule.source)"
      >
        {{ where(rule.source) }}
      </button>
    </p>
    <ul class="ps-4">
      <li
        v-for="(declaration, index) in rule.declarations"
        :key="index"
        :data-status="declaration.status"
        :data-property="declaration.property"
        data-testid="elements-declaration"
      >
        <component
          :is="declaration.source ? 'button' : 'span'"
          :type="declaration.source ? 'button' : undefined"
          class="rounded-sm text-start break-words"
          :class="[
            declaration.status === 'active' ? '' : 'text-dimmed line-through decoration-1',
            declaration.source ? 'cursor-pointer hover:underline hover:decoration-dotted focus-visible:outline-2 focus-visible:outline-primary' : ''
          ]"
          data-testid="elements-declaration-link"
          @click="declaration.source && emit('open', declaration.source)"
        >
          <span :class="declaration.status === 'active' ? 'text-info' : ''">{{ declaration.property }}</span>: <span :class="declaration.status === 'active' ? 'text-highlighted' : ''">{{ declaration.value }}</span><span
            v-if="declaration.important"
            :class="declaration.status === 'active' ? 'text-warning' : ''"
          > !important</span>;<span
            v-if="declaration.source"
            class="sr-only"
          > ({{ linkLabel(declaration.source) }})</span>
        </component>
        <span
          v-if="declaration.status === 'overridden'"
          class="sr-only"
        >, {{ t('debugging.elements.overridden') }}</span>
        <span
          v-if="declaration.status === 'invalid'"
          class="ms-1 font-sans text-[11px] text-warning"
        ><UIcon
          name="i-lucide-triangle-alert"
          class="me-0.5 inline size-3 align-[-0.1em]"
        />{{ t('debugging.elements.invalid') }}</span>
        <span
          v-for="name in declaration.missing"
          :key="name"
          class="block font-sans text-[11px] text-warning"
          data-testid="elements-missing"
        ><UIcon
          name="i-lucide-triangle-alert"
          class="me-0.5 inline size-3 align-[-0.1em]"
        />{{ t('debugging.elements.missing', { name }) }}</span>
      </li>
    </ul>
    <p class="text-dimmed">
      }
    </p>
  </div>
</template>
