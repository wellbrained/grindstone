<script setup lang="ts">
import type { A11yRow } from '#shared/levels'

// One node of the Accessibility panel's tree (WebA11y), with its children as a nested list: a screen reader hears the
// nesting ("list, 3 items", "level 2") without the panel needing a tree widget's keys. Text only.
export interface A11yNode {
  row: A11yRow
  children: A11yNode[]
}

defineProps<{ node: A11yNode }>()

const { t } = useI18n()

/** Roles that need a name: an empty one is shown, so a nameless button stands out. */
const NAMED = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton', 'img', 'tab', 'menuitem', 'option', 'dialog', 'alertdialog'])
const showsName = (row: A11yRow) => row.name !== '' || NAMED.has(row.role)
/** A row's words after its role: its value, states and description. */
const details = (row: A11yRow) => [row.value, ...row.states.filter(state => state !== 'focused'), row.description].filter(Boolean)
</script>

<template>
  <li class="py-0.5">
    <span
      class="rounded-sm px-1 break-words"
      :class="node.row.focused ? 'bg-primary/15 text-highlighted' : 'text-toned'"
      :data-focused="node.row.focused || undefined"
      data-testid="a11y-row"
    >
      <span :class="node.row.role === 'text' ? 'text-dimmed' : 'text-info'">{{ node.row.role }}</span>
      <template v-if="showsName(node.row)">
        {{ ' ' }}<span class="text-highlighted">{{ t('web.a11y.named', { name: node.row.name }) }}</span>
      </template>
      <template v-if="details(node.row).length">
        {{ ' ' }}<span class="font-sans text-muted">{{ details(node.row).join(t('web.a11y.separator')) }}</span>
      </template>
      <template v-if="node.row.focused">
        {{ ' ' }}<span class="font-sans font-medium text-primary">{{ t('web.a11y.focusedMark') }}</span>
      </template>
    </span>
    <ul
      v-if="node.children.length"
      class="ps-3"
    >
      <WebA11yNode
        v-for="(child, index) in node.children"
        :key="index"
        :node="child"
      />
    </ul>
  </li>
</template>
