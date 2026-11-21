<script setup lang="ts">
import { levelNumber, trackById } from '#shared/levels'
import { browserMessages, webCheatGroups, webCheatLevels, webGroupKey, webMessageKey, webNoteKey, webSummaryKey, webTitleKey } from '~/utils/web-cheatsheet'

const { t } = useI18n()
const trackTitle = trackById('web')!.title
useHead({ title: t('webCheat.title') })
useSeoMeta({ description: t('webCheat.intro') })

const query = ref('')
const copied = ref<string | null>(null)

const matches = (q: string, texts: string[]) => !q || texts.some(text => text.toLowerCase().includes(q))

// Filter on the title, its (translated) summary and its example lines and notes; a message on its text and both notes.
const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  return webCheatGroups
    .map(group => ({
      ...group,
      entries: group.entries.filter(entry => matches(q, [
        t(webTitleKey(entry.id)),
        t(webSummaryKey(entry.id)),
        ...entry.examples.flatMap((example, i) => [example.line, t(webNoteKey(entry.id, i))])
      ]))
    }))
    .filter(group => group.entries.length > 0)
})

const messages = computed(() => {
  const q = query.value.trim().toLowerCase()
  return browserMessages.filter(message => matches(q, [message.message, t(webMessageKey(message.id, 'means')), t(webMessageKey(message.id, 'look'))]))
})

const sections = computed(() => [...webCheatGroups.map(group => group.id), 'messages'])
const noMatch = computed(() => groups.value.length === 0 && messages.value.length === 0)

// the same line can sit on two cards: the tick shows on the one clicked
async function copy(entryId: string, line: string) {
  const key = `${entryId} ${line}`
  try {
    await navigator.clipboard.writeText(line)
    copied.value = key
    setTimeout(() => {
      if (copied.value === key) copied.value = null
    }, 1500)
  } catch {
    // clipboard blocked: nothing to do, the line is still selectable
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
    <!-- same frame as the Debugging cheat sheet: full page width, as many columns of at least 20rem as fit -->
    <!-- no kicker above the title: the way back to the track's levels instead (a link, muted) -->
    <nav :aria-label="t('play.breadcrumb')">
      <NuxtLink
        to="/web"
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
      {{ t('webCheat.title') }}
    </h1>
    <p class="mt-4 max-w-3xl text-toned">
      {{ t('webCheat.intro') }}
    </p>

    <div class="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
      <UInput
        v-model="query"
        icon="i-lucide-search"
        :placeholder="t('webCheat.search')"
        :aria-label="t('webCheat.search')"
        class="w-full sm:max-w-xs"
      />
      <nav
        class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
        :aria-label="t('webCheat.sections')"
      >
        <a
          v-for="id in sections"
          :key="id"
          :href="`#${id}`"
          class="text-muted hover:text-highlighted"
        >{{ t(webGroupKey(id)) }}</a>
      </nav>
    </div>

    <p
      v-if="noMatch"
      class="mt-10 text-muted"
    >
      {{ t('webCheat.none', { query }) }}
    </p>

    <div class="mt-4 gap-x-8 md:columns-[20rem]">
      <section
        v-for="group in groups"
        :id="group.id"
        :key="group.id"
        class="break-inside-avoid pt-6 scroll-mt-20"
      >
        <h2 class="font-mono text-sm font-medium text-muted">
          {{ t(webGroupKey(group.id)) }}
        </h2>
        <ul class="mt-3 space-y-4">
          <li
            v-for="entry in group.entries"
            :key="entry.id"
            class="rounded-lg border border-default bg-elevated p-5"
          >
            <h3 class="text-xl leading-tight font-bold tracking-tight text-highlighted">
              {{ t(webTitleKey(entry.id)) }}
            </h3>
            <p class="mt-1.5 text-sm text-toned">
              {{ t(webSummaryKey(entry.id)) }}
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
                  :aria-label="t('webCheat.copy', { line: example.line })"
                  @click="copy(entry.id, example.line)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block text-xs text-muted"># {{ t(webNoteKey(entry.id, exampleIndex)) }}</span>
                    <span class="block text-highlighted wrap-break-word"><span
                      class="mr-2 text-dimmed"
                      aria-hidden="true"
                    >›</span>{{ example.line }}</span>
                  </span>
                  <UIcon
                    :name="copied === `${entry.id} ${example.line}` ? 'i-lucide-check' : 'i-lucide-copy'"
                    class="mt-5 size-3.5 shrink-0 text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                    :class="{ 'text-success opacity-100': copied === `${entry.id} ${example.line}` }"
                  />
                </button>
                <div
                  v-else
                  class="px-3 py-1"
                >
                  <span class="block text-xs text-muted"># {{ t(webNoteKey(entry.id, exampleIndex)) }}</span>
                  <span class="block text-highlighted wrap-break-word">{{ example.line }}</span>
                </div>
              </li>
            </ul>
            <p
              v-if="webCheatLevels(entry.levels).length"
              class="mt-3 text-xs text-muted"
            >
              {{ t('webCheat.practise') }}
              <template
                v-for="(level, index) in webCheatLevels(entry.levels)"
                :key="level.id"
              >
                <NuxtLink
                  :to="levelPath(level)"
                  class="text-highlighted underline decoration-(--ui-border-accented) underline-offset-2 hover:text-primary hover:decoration-primary"
                >{{ levelNumber(level.id) }} {{ level.title }}</NuxtLink><span v-if="index < webCheatLevels(entry.levels).length - 1"> · </span>
              </template>
            </p>
          </li>
        </ul>
      </section>

      <!-- the browser's messages the levels show: the message is the card's heading -->
      <section
        v-if="messages.length"
        id="messages"
        class="break-inside-avoid pt-6 scroll-mt-20"
      >
        <h2 class="font-mono text-sm font-medium text-muted">
          {{ t(webGroupKey('messages')) }}
        </h2>
        <ul class="mt-3 space-y-4">
          <li
            v-for="message in messages"
            :key="message.id"
            class="rounded-lg border border-default bg-elevated p-5"
          >
            <h3 class="font-mono text-base leading-snug font-bold text-highlighted wrap-break-word">
              <span
                class="mr-2 text-muted"
                aria-hidden="true"
              >!</span>{{ message.message }}
            </h3>
            <dl class="mt-2 space-y-2 text-sm">
              <div>
                <dt class="text-xs font-medium text-muted">
                  {{ t('webCheat.means') }}
                </dt>
                <dd class="text-toned">
                  {{ t(webMessageKey(message.id, 'means')) }}
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted">
                  {{ t('webCheat.look') }}
                </dt>
                <dd class="text-toned">
                  {{ t(webMessageKey(message.id, 'look')) }}
                </dd>
              </div>
            </dl>
            <p
              v-if="webCheatLevels(message.levels).length"
              class="mt-3 text-xs text-muted"
            >
              {{ t('webCheat.practise') }}
              <template
                v-for="(level, index) in webCheatLevels(message.levels)"
                :key="level.id"
              >
                <NuxtLink
                  :to="levelPath(level)"
                  class="text-highlighted underline decoration-(--ui-border-accented) underline-offset-2 hover:text-primary hover:decoration-primary"
                >{{ levelNumber(level.id) }} {{ level.title }}</NuxtLink><span v-if="index < webCheatLevels(message.levels).length - 1"> · </span>
              </template>
            </p>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
