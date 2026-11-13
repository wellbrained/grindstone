<script setup lang="ts">
import { levelNumber } from '#shared/levels'
import { debugCheatGroups, debugCheatLevels, debugErrorKey, debugGroupKey, debugNoteKey, debugSummaryKey, debugTitleKey, debugErrorTypes } from '~/utils/debugging-cheatsheet'

const { t } = useI18n()
useHead({ title: t('debugCheat.title') })
useSeoMeta({ description: t('debugCheat.intro') })

const query = ref('')
const copied = ref<string | null>(null)

const matches = (q: string, texts: string[]) => !q || texts.some(text => text.toLowerCase().includes(q))

// Filter on the title, its (translated) summary and its example lines and notes; an error on its message and both texts.
const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  return debugCheatGroups
    .map(group => ({
      ...group,
      entries: group.entries.filter(entry => matches(q, [
        t(debugTitleKey(entry.id)),
        t(debugSummaryKey(entry.id)),
        ...entry.examples.flatMap((example, i) => [example.line, t(debugNoteKey(entry.id, i))])
      ]))
    }))
    .filter(group => group.entries.length > 0)
})

const errors = computed(() => {
  const q = query.value.trim().toLowerCase()
  return debugErrorTypes.filter(error => matches(q, [error.message, t(debugErrorKey(error.id, 'means')), t(debugErrorKey(error.id, 'look'))]))
})

const sections = computed(() => [...debugCheatGroups.map(group => group.id), 'errors'])
const noMatch = computed(() => groups.value.length === 0 && errors.value.length === 0)

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
    <!-- same frame as the Git cheat sheet: full page width, as many columns of at least 20rem as fit -->
    <p class="font-mono text-sm text-primary">
      {{ t('debugCheat.kicker') }}
    </p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      {{ t('debugCheat.title') }}
    </h1>
    <p class="mt-4 max-w-3xl text-toned">
      {{ t('debugCheat.intro') }}
    </p>

    <div class="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
      <UInput
        v-model="query"
        icon="i-lucide-search"
        :placeholder="t('debugCheat.search')"
        :aria-label="t('debugCheat.search')"
        class="w-full sm:max-w-xs"
      />
      <nav
        class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
        :aria-label="t('debugCheat.sections')"
      >
        <a
          v-for="id in sections"
          :key="id"
          :href="`#${id}`"
          class="text-muted hover:text-highlighted"
        >{{ t(debugGroupKey(id)) }}</a>
      </nav>
    </div>

    <p
      v-if="noMatch"
      class="mt-10 text-muted"
    >
      {{ t('debugCheat.none', { query }) }}
    </p>

    <div class="mt-4 gap-x-8 md:columns-[20rem]">
      <section
        v-for="group in groups"
        :id="group.id"
        :key="group.id"
        class="break-inside-avoid pt-6 scroll-mt-20"
      >
        <h2 class="font-mono text-sm font-medium text-muted">
          {{ t(debugGroupKey(group.id)) }}
        </h2>
        <ul class="mt-3 space-y-4">
          <li
            v-for="entry in group.entries"
            :key="entry.id"
            class="rounded-lg border border-default bg-elevated p-5"
          >
            <h3 class="text-xl leading-tight font-bold tracking-tight text-highlighted">
              {{ t(debugTitleKey(entry.id)) }}
            </h3>
            <p class="mt-1.5 text-sm text-toned">
              {{ t(debugSummaryKey(entry.id)) }}
            </p>
            <!-- a small console: each example as a "# what it does" comment above its line; click a line to copy it, a key or a status word is plain -->
            <ul
              v-if="entry.examples.length"
              class="mt-3 space-y-1 rounded-r-lg border-l-2 border-accented bg-(--app-terminal) py-2 font-mono text-sm"
            >
              <li
                v-for="(example, exampleIndex) in entry.examples"
                :key="example.line"
              >
                <button
                  v-if="example.copy !== false"
                  type="button"
                  class="group flex w-full cursor-pointer items-start gap-2 px-3 py-1 text-left hover:bg-elevated/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  :aria-label="t('debugCheat.copy', { line: example.line })"
                  @click="copy(example.line)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block text-xs text-muted"># {{ t(debugNoteKey(entry.id, exampleIndex)) }}</span>
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
                <div
                  v-else
                  class="px-3 py-1"
                >
                  <span class="block text-xs text-muted"># {{ t(debugNoteKey(entry.id, exampleIndex)) }}</span>
                  <span class="block text-highlighted wrap-break-word">{{ example.line }}</span>
                </div>
              </li>
            </ul>
            <p
              v-if="debugCheatLevels(entry.levels).length"
              class="mt-3 text-xs text-muted"
            >
              {{ t('debugCheat.practise') }}
              <template
                v-for="(level, index) in debugCheatLevels(entry.levels)"
                :key="level.id"
              >
                <NuxtLink
                  :to="levelPath(level)"
                  class="text-highlighted underline decoration-(--ui-border-accented) underline-offset-2 hover:text-primary hover:decoration-primary"
                >{{ levelNumber(level.id) }} {{ level.title }}</NuxtLink><span v-if="index < debugCheatLevels(entry.levels).length - 1"> · </span>
              </template>
            </p>
          </li>
        </ul>
      </section>

      <!-- the error messages the levels quote: the message is the card's heading -->
      <section
        v-if="errors.length"
        id="errors"
        class="break-inside-avoid pt-6 scroll-mt-20"
      >
        <h2 class="font-mono text-sm font-medium text-muted">
          {{ t(debugGroupKey('errors')) }}
        </h2>
        <ul class="mt-3 space-y-4">
          <li
            v-for="error in errors"
            :key="error.id"
            class="rounded-lg border border-default bg-elevated p-5"
          >
            <h3 class="font-mono text-base leading-snug font-bold text-highlighted wrap-break-word">
              <span
                class="mr-2 text-primary"
                aria-hidden="true"
              >!</span>{{ error.message }}
            </h3>
            <dl class="mt-2 space-y-2 text-sm">
              <div>
                <dt class="text-xs font-medium text-muted">
                  {{ t('debugCheat.means') }}
                </dt>
                <dd class="text-toned">
                  {{ t(debugErrorKey(error.id, 'means')) }}
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted">
                  {{ t('debugCheat.look') }}
                </dt>
                <dd class="text-toned">
                  {{ t(debugErrorKey(error.id, 'look')) }}
                </dd>
              </div>
            </dl>
            <p
              v-if="debugCheatLevels(error.levels).length"
              class="mt-3 text-xs text-muted"
            >
              {{ t('debugCheat.practise') }}
              <template
                v-for="(level, index) in debugCheatLevels(error.levels)"
                :key="level.id"
              >
                <NuxtLink
                  :to="levelPath(level)"
                  class="text-highlighted underline decoration-(--ui-border-accented) underline-offset-2 hover:text-primary hover:decoration-primary"
                >{{ levelNumber(level.id) }} {{ level.title }}</NuxtLink><span v-if="index < debugCheatLevels(error.levels).length - 1"> · </span>
              </template>
            </p>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
