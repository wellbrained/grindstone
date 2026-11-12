<script setup lang="ts">
import { levelPlace } from '#shared/levels'

definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const { t } = useI18n()

// any live track's level: /<track>/<slug> (the play page runs the git engine, the only one so far)
const level = levelFromRoute(String(route.params.track), String(route.params.level))
const place = level ? levelPlace(level.id) : null
if (!level || !place) throw createError({ statusCode: 404, statusMessage: 'Level not found', fatal: true })
useHead({ title: level.title })

// Terminal (default) / IDE, remembered per viewer (docs/adr/0004-editor-layouts.md)
const { layout, setLayout } = usePlayLayout()
const layoutModel = computed({ get: () => layout.value, set: setLayout })

const workbench = useTemplateRef<{ showEditor: () => void, focusTerminal: () => void }>('workbench')

// `edit <file>` and the conflicted-files list: the editor panel in the Terminal layout, a tab in the IDE
function openFile(path: string) {
  if (layout.value === 'terminal') {
    play.openEditor(path)
    return
  }
  play.tabs.open(path)
  workbench.value?.showEditor()
}

const play = useLevelPlay(level, { onEdit: openFile })
const { editor, debriefOpen, stats, next, save } = play

// back to typing once a dialog has fully closed (earlier, the dialog would hand the focus back to the button that opened it)
const focusTerminal = () => workbench.value?.focusTerminal()
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 py-4 sm:px-6 lg:px-8">
    <!-- the switch sits right in its own row in both layouts, so it never moves under the cursor -->
    <div class="mb-3 flex items-center justify-between gap-4">
      <p class="flex min-w-0 items-center gap-2 text-xs text-muted md:invisible">
        <UIcon
          name="i-lucide-keyboard"
          class="size-4 shrink-0"
        />
        {{ t('play.keyboard') }}
      </p>
      <LayoutSwitch
        v-model="layoutModel"
        class="shrink-0"
      />
    </div>

    <PlayWorkbench
      ref="workbench"
      :play="play"
      :layout="layout"
      :place="place"
    />

    <FileEditor
      :editor="editor"
      @save="save"
      @cancel="editor = null"
      @closed="focusTerminal"
    />
    <DebriefDialog
      v-if="level.kind === 'scenario'"
      v-model:open="debriefOpen"
      :level="level"
      :next="next"
      :track-to="trackPath(place.track.id)"
      :stats="stats"
      @closed="focusTerminal"
    />
  </div>
</template>
