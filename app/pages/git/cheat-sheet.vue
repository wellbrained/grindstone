<script setup lang="ts">
import { trackById } from '#shared/levels'
import { cheatGroups, groupKey, levelsUsing, noteKey, summaryKey } from '~/utils/git-cheatsheet'

const { t } = useI18n()
const trackTitle = trackById('git')!.title
useHead({ title: t('cheat.title') })
useSeoMeta({ description: t('cheat.intro') })

const query = ref('')
const copied = ref<string | null>(null)

// Filter on the command name, its (translated) summary and its example lines and notes.
const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  return cheatGroups
    .map(group => ({
      ...group,
      commands: group.commands.filter(command => !q || [command.name, t(summaryKey(command.name)), ...command.examples.flatMap((e, i) => [e.line, t(noteKey(command.name, i))])]
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
    <!-- no kicker above the title: the way back to the track's levels instead (a link, muted) -->
    <nav :aria-label="t('play.breadcrumb')">
      <NuxtLink
        to="/git"
        class="-ms-1 inline-flex min-h-6 items-center gap-1 rounded-sm px-1 text-sm text-muted hover:text-highlighted pointer-coarse:min-h-11"
        data-testid="cheat-back"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4"
        />
        {{ t('track.levelsOf', { track: trackTitle }) }}
      </NuxtLink>
    </nav>
    <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
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
          class="text-muted hover:text-highlighted pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
        >{{ t(groupKey(group.id)) }}</a>
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
          {{ t(groupKey(group.id)) }}
        </h2>
        <ul class="mt-3 space-y-4">
          <li
            v-for="command in group.commands"
            :key="command.name"
            class="rounded-lg border border-default bg-elevated p-5"
          >
            <!-- the heading is itself a prompt: "$ git rebase" (owner's pick, option B6, 2026-11-12); its $ is muted, like a prompt (ember only marks what is active or next) -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 class="font-mono text-xl leading-tight font-bold tracking-tight text-highlighted">
                <span
                  class="mr-2 text-muted"
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
              {{ t(summaryKey(command.name)) }}
            </p>
            <!-- a small terminal: each example as a "# what it does" comment above its command; click a pair to copy the command -->
            <ul class="mt-3 space-y-1 rounded-r-lg border-l-2 border-accented bg-(--app-terminal) py-2 font-mono text-sm">
              <li
                v-for="(example, exampleIndex) in command.examples"
                :key="example.line"
              >
                <button
                  type="button"
                  class="group flex w-full cursor-pointer items-start gap-2 px-3 py-1 text-left hover:bg-elevated/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  :aria-label="t('cheat.copy', { line: example.line })"
                  @click="copy(example.line)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block text-xs text-muted"># {{ t(noteKey(command.name, exampleIndex)) }}</span>
                    <span class="block text-highlighted wrap-break-word"><span
                      class="mr-2 text-dimmed"
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
            <CheatLevelLinks
              :levels="levelsUsing(command.name)"
              :label="t('cheat.practise')"
            />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
