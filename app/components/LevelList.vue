<script setup lang="ts">
import { levels } from '#shared/levels'

// The track's levels in play order, with solved state. Progress only exists in the browser, so the caller wraps this in <ClientOnly>.
defineProps<{ showProgress: boolean }>()

const { t } = useI18n()
const { levelProgress } = useProgress()
</script>

<template>
  <ol class="space-y-2">
    <li
      v-for="(level, index) in levels"
      :key="level.id"
    >
      <NuxtLink
        :to="levelPath(level)"
        class="group flex items-center gap-4 rounded-lg border border-default bg-elevated px-4 py-3 transition-colors hover:border-primary hover:bg-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :data-level="level.id"
      >
        <span class="font-mono text-sm text-muted">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="min-w-0 flex-1 font-medium text-highlighted">{{ level.title }}</span>
        <template v-if="showProgress">
          <span
            v-if="levelProgress(level.id)?.solved"
            class="flex items-center gap-1.5 text-sm text-success"
          >
            <UIcon
              name="i-lucide-circle-check"
              class="size-4"
            />
            <span>{{ t('home.solved') }}</span>
            <span class="hidden font-mono text-xs text-muted sm:inline">{{ t('home.best', { n: levelProgress(level.id)!.bestCommands }) }}</span>
          </span>
          <span
            v-else
            class="flex items-center gap-1.5 text-sm text-muted"
          >
            <UIcon
              name="i-lucide-circle"
              class="size-4"
            />
            {{ t('home.open') }}
          </span>
        </template>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </NuxtLink>
    </li>
  </ol>
</template>
