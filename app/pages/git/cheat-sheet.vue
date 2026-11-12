<script setup lang="ts">
import { levelNumber } from '#shared/levels'
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
  <div class="mx-auto w-full max-w-[110rem] px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
    <!-- full page width like the header; as many columns of at least 20rem as fit (1 on phones, 4 on wide screens) -->
    <p class="font-mono text-sm text-primary">
      {{ t('cheat.kicker') }}
    </p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      {{ t('cheat.title') }}
    </h1>
    <p class="mt-4 max-w-3xl text-toned">
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

    <div class="mt-4 gap-x-8 md:columns-[20rem]">
      <section
        v-for="group in groups"
        :id="group.id"
        :key="group.id"
        class="break-inside-avoid pt-6 scroll-mt-20"
      >
        <h2 class="font-mono text-sm font-medium text-muted">
          {{ group.title }}
        </h2>
        <ul class="mt-3 space-y-4">
          <li
            v-for="command in group.commands"
            :key="command.name"
            class="rounded-lg border border-default bg-elevated p-5"
          >
            <!-- the heading is itself a prompt: "$ git rebase" (owner's pick, option B6, 2026-11-12) -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 class="font-mono text-xl leading-tight font-bold tracking-tight text-highlighted">
                <span
                  class="mr-2 text-primary"
                  aria-hidden="true"
                >$</span>git {{ command.name }}
              </h3>
              <UBadge
                v-if="command.comingSoon"
                :label="t('cheat.soon')"
                color="neutral"
                variant="soft"
                size="sm"
              />
            </div>
            <p class="mt-1.5 text-sm text-toned">
              {{ command.summary }}
            </p>
            <!-- a small terminal: each example as a "# what it does" comment above its command; click a pair to copy the command -->
            <ul class="mt-3 space-y-1 rounded-r-lg border-l-2 border-primary bg-(--app-terminal) py-2 font-mono text-sm">
              <li
                v-for="example in command.examples"
                :key="example.line"
              >
                <button
                  type="button"
                  class="group flex w-full cursor-pointer items-start gap-2 px-3 py-1 text-left hover:bg-elevated/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  :aria-label="t('cheat.copy', { line: example.line })"
                  @click="copy(example.line)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block text-xs text-muted"># {{ example.note }}</span>
                    <span class="block text-highlighted wrap-break-word"><span
                      class="mr-2 text-primary"
                      aria-hidden="true"
                    >$</span>{{ example.line }}</span>
                  </span>
                  <UIcon
                    :name="copied === example.line ? 'i-lucide-check' : 'i-lucide-copy'"
                    class="mt-5 size-3.5 shrink-0 text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                    :class="{ 'text-success opacity-100': copied === example.line }"
                  />
                </button>
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
                >{{ levelNumber(level.id) }} {{ level.title }}</NuxtLink><span v-if="index < levelsUsing(command.name).length - 1"> · </span>
              </template>
            </p>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
