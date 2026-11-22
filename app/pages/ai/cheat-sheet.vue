<script setup lang="ts">
import { trackById } from '#shared/levels'
import { aiCheatGroups, aiCheatLevels, aiGroupKey, aiNoteKey, aiSummaryKey, aiTitleKey } from '~/utils/ai-cheatsheet'

// The Working with AI cheat sheet (ADR 0008; docs/features/ui.md "Working with AI cheat sheet"): what to check in an AI
// pull request, one section per chapter's kind of problem and one for steering, each check with the lines from the
// levels that show it and links to the scenarios that practise it. The same frame as the Debugging cheat sheet.
const { t } = useI18n()
const trackTitle = trackById('ai')!.title
useHead({ title: t('aiCheat.title') })
useSeoMeta({ description: t('aiCheat.intro') })

const query = ref('')
const copied = ref<string | null>(null)

const matches = (q: string, texts: string[]) => !q || texts.some(text => text.toLowerCase().includes(q))

// Filter on the title, its (translated) summary and its example lines and notes.
const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  return aiCheatGroups
    .map(group => ({
      ...group,
      entries: group.entries.filter(entry => matches(q, [
        t(aiTitleKey(entry.id)),
        t(aiSummaryKey(entry.id)),
        ...entry.examples.flatMap((example, i) => [example.line, t(aiNoteKey(entry.id, i))])
      ]))
    }))
    .filter(group => group.entries.length > 0)
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
    <!-- same frame as the Git and Debugging cheat sheets: full page width, as many columns of at least 20rem as fit -->
    <!-- no kicker above the title: the way back to the track's levels instead (a link, muted) -->
    <nav :aria-label="t('play.breadcrumb')">
      <NuxtLink
        to="/ai"
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
      {{ t('aiCheat.title') }}
    </h1>
    <p class="mt-4 max-w-3xl text-toned">
      {{ t('aiCheat.intro') }}
    </p>

    <div class="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
      <UInput
        v-model="query"
        icon="i-lucide-search"
        :placeholder="t('aiCheat.search')"
        :aria-label="t('aiCheat.search')"
        class="w-full sm:max-w-xs"
      />
      <nav
        class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
        :aria-label="t('aiCheat.sections')"
      >
        <a
          v-for="group in aiCheatGroups"
          :key="group.id"
          :href="`#${group.id}`"
          class="text-muted hover:text-highlighted pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
        >{{ t(aiGroupKey(group.id)) }}</a>
      </nav>
    </div>

    <p
      v-if="groups.length === 0"
      class="mt-10 text-muted"
    >
      {{ t('aiCheat.none', { query }) }}
    </p>

    <div class="mt-4 gap-x-8 md:columns-[20rem]">
      <section
        v-for="group in groups"
        :id="group.id"
        :key="group.id"
        class="break-inside-avoid pt-6 scroll-mt-20"
        data-testid="cheat-group"
      >
        <h2 class="font-mono text-sm font-medium text-muted">
          {{ t(aiGroupKey(group.id)) }}
        </h2>
        <ul class="mt-3 space-y-4">
          <li
            v-for="entry in group.entries"
            :key="entry.id"
            class="rounded-lg border border-default bg-elevated p-5"
            :data-entry="entry.id"
          >
            <h3 class="text-xl leading-tight font-bold tracking-tight text-highlighted">
              {{ t(aiTitleKey(entry.id)) }}
            </h3>
            <p class="mt-1.5 text-sm text-toned">
              {{ t(aiSummaryKey(entry.id)) }}
            </p>
            <!-- the lines from the levels, each with a "# what to see" note above it; click a line to copy it -->
            <ul
              v-if="entry.examples.length"
              class="mt-3 space-y-1 rounded-r-lg border-l-2 border-accented bg-(--app-terminal) py-2 font-mono text-sm"
            >
              <li
                v-for="(example, exampleIndex) in entry.examples"
                :key="example.line"
              >
                <button
                  type="button"
                  class="group flex w-full cursor-pointer items-start gap-2 px-3 py-1 text-left hover:bg-elevated/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  :aria-label="t('aiCheat.copy', { line: example.line })"
                  @click="copy(example.line)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block text-xs text-muted"># {{ t(aiNoteKey(entry.id, exampleIndex)) }}</span>
                    <span class="block text-highlighted wrap-break-word"><span
                      class="mr-2 text-dimmed"
                      aria-hidden="true"
                    >›</span>{{ example.line }}</span>
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
              :levels="aiCheatLevels(entry.levels)"
              :label="t('aiCheat.practise')"
            />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
