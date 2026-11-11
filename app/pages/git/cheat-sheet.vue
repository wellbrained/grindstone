<script setup lang="ts">
import { cheatGroups, levelsUsing } from '~/utils/git-cheatsheet'

const { t } = useI18n()
useHead({ title: t('cheat.title') })
useSeoMeta({ description: t('cheat.intro') })

const query = ref('')
const copied = ref<string | null>(null)

// Filter on the command name, its summary and its example lines.
const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  return cheatGroups
    .map(group => ({
      ...group,
      commands: group.commands.filter(command => !q || [command.name, command.summary, ...command.examples.flatMap(e => [e.line, e.note])]
        .some(text => text.toLowerCase().includes(q)))
    }))
    .filter(group => group.commands.length > 0)
})

async function copy(line: string) {
  try {
    await navigator.clipboard.writeText(line)
    copied.value = line
    setTimeout(() => {
      if (copied.value === line) copied.value = null
    }, 1500)
  } catch {
    // clipboard blocked: nothing to do, the line is still selectable
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
    <p class="font-mono text-sm text-primary">
      {{ t('cheat.kicker') }}
    </p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      {{ t('cheat.title') }}
    </h1>
    <p class="mt-4 text-toned">
      {{ t('cheat.intro') }}
    </p>

    <div class="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
      <UInput
        v-model="query"
        icon="i-lucide-search"
        :placeholder="t('cheat.search')"
        :aria-label="t('cheat.search')"
        class="w-full sm:max-w-xs"
      />
      <nav
        class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
        :aria-label="t('cheat.sections')"
      >
        <a
          v-for="group in cheatGroups"
          :key="group.id"
          :href="`#${group.id}`"
          class="text-muted hover:text-highlighted"
        >{{ group.title }}</a>
      </nav>
    </div>

    <p
      v-if="groups.length === 0"
      class="mt-10 text-muted"
    >
      {{ t('cheat.none', { query }) }}
    </p>

    <section
      v-for="group in groups"
      :id="group.id"
      :key="group.id"
      class="mt-10 scroll-mt-20"
    >
      <h2 class="font-mono text-sm font-medium text-muted">
        {{ group.title }}
      </h2>
      <ul class="mt-3 divide-y divide-default rounded-lg border border-default bg-elevated">
        <li
          v-for="command in group.commands"
          :key="command.name"
          class="p-4"
        >
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 class="font-mono text-base font-semibold text-highlighted">
              git {{ command.name }}
            </h3>
            <UBadge
              v-if="command.comingSoon"
              :label="t('cheat.soon')"
              color="neutral"
              variant="soft"
              size="sm"
            />
            <p class="basis-full text-sm text-toned sm:basis-auto">
              {{ command.summary }}
            </p>
          </div>
          <ul class="mt-3 space-y-1.5">
            <li
              v-for="example in command.examples"
              :key="example.line"
              class="flex flex-wrap items-center gap-x-3 gap-y-0.5"
            >
              <button
                type="button"
                class="group inline-flex cursor-pointer items-center gap-2 rounded-md bg-muted px-2 py-1 font-mono text-sm text-highlighted hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
                :aria-label="t('cheat.copy', { line: example.line })"
                @click="copy(example.line)"
              >
                <span class="break-all">{{ example.line }}</span>
                <UIcon
                  :name="copied === example.line ? 'i-lucide-check' : 'i-lucide-copy'"
                  class="size-3.5 shrink-0 text-dimmed group-hover:text-toned"
                  :class="{ 'text-success group-hover:text-success': copied === example.line }"
                />
              </button>
              <span class="text-sm text-muted">{{ example.note }}</span>
            </li>
          </ul>
          <p
            v-if="levelsUsing(command.name).length"
            class="mt-3 text-xs text-muted"
          >
            {{ t('cheat.practise') }}
            <template
              v-for="(level, index) in levelsUsing(command.name)"
              :key="level.id"
            >
              <NuxtLink
                :to="levelPath(level)"
                class="text-primary hover:underline"
              >{{ level.title }}</NuxtLink><span v-if="index < levelsUsing(command.name).length - 1"> · </span>
            </template>
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
