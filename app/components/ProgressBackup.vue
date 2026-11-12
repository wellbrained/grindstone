<script setup lang="ts">
import { readProgress, serializeProgress, summarizeProgress } from '#shared/levels'
import type { Progress, ReadResult } from '#shared/levels'

// "Your progress" on the About page (ADR 0006, "Backup"): progress lives only in this browser, so you can download it
// as a JSON file, load such a file back (checked with the same parser as the stored progress: a bad file changes
// nothing and says why) and reset everything. Loading over existing progress asks first.
const { t } = useI18n()
const { progress, replace } = useProgress()
const { askResetAll } = useProgressActions()
const { ask } = useConfirm()

const input = useTemplateRef<HTMLInputElement>('input')
const message = ref<{ tone: 'success' | 'error', text: string } | null>(null)

const hasAny = computed(() => Object.keys(progress.value.levels).length > 0)
const describe = (value: Progress) => {
  const { solved, practiseAgain } = summarizeProgress(value)
  return t('backup.summary', { solved: t('backup.solved', solved), flagged: t('backup.flagged', practiseAgain) })
}

/** grindstone-progress-YYYY-MM-DD.json, in the viewer's own date. */
function fileName(now = new Date()) {
  const two = (value: number) => String(value).padStart(2, '0')
  return `grindstone-progress-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.json`
}

function download() {
  const blob = new Blob([serializeProgress(progress.value)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName()
  link.click()
  URL.revokeObjectURL(url)
  message.value = { tone: 'success', text: t('backup.downloaded', { file: link.download }) }
}

const ERRORS: Record<Extract<ReadResult, { ok: false }>['error'], string> = {
  json: 'backup.error.json',
  shape: 'backup.error.shape',
  version: 'backup.error.version'
}

function load(next: Progress, file: string) {
  replace(next)
  message.value = { tone: 'success', text: t('backup.loaded', { file, what: describe(next) }) }
}

async function onFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  // the same file can be picked again later
  target.value = ''
  if (!file) return
  let text: string
  try {
    text = await file.text()
  } catch {
    message.value = { tone: 'error', text: t('backup.error.read', { file: file.name }) }
    return
  }
  const result = readProgress(text)
  if (!result.ok) {
    message.value = { tone: 'error', text: t(ERRORS[result.error], { file: file.name }) }
    return
  }
  if (!hasAny.value) {
    load(result.progress, file.name)
    return
  }
  ask({
    title: t('backup.replace.title'),
    text: t('backup.replace.text', { file: file.name, what: describe(result.progress), current: describe(progress.value) }),
    confirmLabel: t('backup.replace.confirm'),
    danger: true,
    onConfirm: () => load(result.progress, file.name)
  })
}
</script>

<template>
  <section
    aria-labelledby="progress-heading"
    data-testid="your-progress"
  >
    <h2
      id="progress-heading"
      class="font-mono text-sm font-medium text-muted"
    >
      {{ t('backup.title') }}
    </h2>
    <p class="mt-4 text-toned">
      {{ t('backup.intro') }}
    </p>
    <p class="mt-2 font-mono text-xs text-muted tabular-nums">
      {{ hasAny ? describe(progress) : t('backup.nothing') }}
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <UButton
        color="neutral"
        icon="i-lucide-download"
        :label="t('backup.download')"
        data-testid="download-progress"
        @click="download"
      />
      <UButton
        color="neutral"
        icon="i-lucide-upload"
        :label="t('backup.load')"
        data-testid="load-progress"
        @click="input?.click()"
      />
      <input
        ref="input"
        type="file"
        accept="application/json,.json"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        data-testid="load-progress-file"
        @change="onFile"
      >
    </div>
    <p
      role="status"
      class="mt-3 min-h-5 text-sm"
      :class="message?.tone === 'error' ? 'text-error' : 'text-success'"
      data-testid="backup-message"
    >
      <template v-if="message">
        <UIcon
          :name="message.tone === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-circle-check'"
          class="mr-1 size-4 align-[-0.2em]"
        />{{ message.text }}
      </template>
    </p>
    <div class="mt-3">
      <UButton
        color="error"
        icon="i-lucide-trash-2"
        :label="t('backup.resetAll')"
        :disabled="!hasAny"
        data-testid="reset-everything"
        @click="askResetAll"
      />
    </div>
  </section>
</template>
