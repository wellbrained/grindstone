<script setup lang="ts">
import type { TreeItem } from '@nuxt/ui'
import { STATUS_LETTER, folderPaths } from '~/utils/file-tree'
import type { FileStatus, TreeNode } from '~/utils/file-tree'

// The IDE's file explorer: the engine's working tree as folders and files, with a git status letter and colour per file
// (never colour alone). Clicking a file opens it in a tab; deleted files are listed but cannot be opened.
const props = defineProps<{
  tree: TreeNode[]
  activePath: string | null
  /** False before `git init`: there are no statuses yet. */
  isRepo: boolean
}>()

const emit = defineEmits<{
  open: [path: string]
}>()

const { t } = useI18n()

const STATUS_CLASS: Record<FileStatus, string> = {
  modified: 'text-warning',
  added: 'text-success',
  untracked: 'text-success',
  deleted: 'text-error',
  conflicted: 'text-error',
  ignored: 'text-dimmed'
}

function iconOf(node: TreeNode) {
  if (node.type === 'folder') return undefined
  if (node.status === 'conflicted') return 'i-lucide-file-warning'
  if (node.deleted) return 'i-lucide-file-x'
  const extension = node.name.slice(node.name.lastIndexOf('.') + 1).toLowerCase()
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'css', 'html'].includes(extension)) return 'i-lucide-file-code'
  if (extension === 'json') return 'i-lucide-file-json'
  if (['md', 'markdown', 'txt'].includes(extension)) return 'i-lucide-file-text'
  return 'i-lucide-file'
}

type ExplorerItem = TreeItem & { node: TreeNode, children?: ExplorerItem[] }

const toItem = (node: TreeNode): ExplorerItem => ({
  label: node.name,
  path: node.path,
  node,
  icon: iconOf(node),
  disabled: node.type === 'file' && node.deleted,
  children: node.type === 'folder' ? node.children.map(toItem) : undefined
})

const items = computed(() => props.tree.map(toItem))

// folders start expanded; the player's collapsing is remembered (new folders show up expanded)
const collapsed = ref(new Set<string>())
const allFolders = computed(() => folderPaths(props.tree))
const expanded = computed({
  get: () => allFolders.value.filter(path => !collapsed.value.has(path)),
  set: (open: string[]) => {
    collapsed.value = new Set(allFolders.value.filter(path => !open.includes(path)))
  }
})

const findItem = (list: ExplorerItem[], path: string): ExplorerItem | undefined => {
  for (const item of list) {
    if (item.node.path === path) return item
    const inside = item.children && findItem(item.children, path)
    if (inside) return inside
  }
  return undefined
}
const selected = computed(() => props.activePath ? findItem(items.value, props.activePath) : undefined)

function onSelect(_event: unknown, item: ExplorerItem) {
  if (item.node.type === 'file' && !item.node.deleted) emit('open', item.node.path)
}

const statusText = (status: FileStatus) => t(`explorer.status.${status}`)
</script>

<template>
  <section
    :aria-label="t('explorer.label')"
    class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-default bg-elevated"
  >
    <header class="flex items-center gap-1.5 border-b border-default px-3 py-1.5 font-mono text-xs font-medium text-muted">
      <UIcon
        name="i-lucide-folder-tree"
        class="size-4"
      />
      <h2>{{ t('explorer.title') }}</h2>
    </header>

    <div class="isolate min-h-0 flex-1 overflow-y-auto p-1">
      <p
        v-if="!tree.length"
        class="px-2 py-4 text-center text-sm text-muted"
      >
        {{ t('explorer.empty') }}
      </p>
      <UTree
        v-else
        :items="items"
        :get-key="(item: ExplorerItem) => item?.node?.path ?? ''"
        :model-value="selected"
        :expanded="expanded"
        size="sm"
        color="neutral"
        :on-select="onSelect"
        :ui="{ link: 'font-mono text-xs py-1 hover:before:bg-accented/60 data-selected:before:bg-accented', linkLabel: 'min-w-0 truncate' }"
        @update:expanded="expanded = $event"
      >
        <template #item-label="{ item }">
          <span
            :data-file="item.node.type === 'file' ? item.node.path : undefined"
            :class="[
              item.node.status ? STATUS_CLASS[item.node.status as FileStatus] : 'text-default',
              item.node.type === 'file' && item.node.deleted && 'line-through'
            ]"
          >{{ item.label }}</span>
          <span
            v-if="item.node.status"
            class="sr-only"
          >({{ item.node.type === 'folder' ? t('explorer.folderChanged') : statusText(item.node.status) }})</span>
        </template>
        <template #item-trailing="{ item, expanded: open }">
          <span
            v-if="item.node.status && item.node.type === 'file'"
            aria-hidden="true"
            class="w-3 shrink-0 text-center font-mono text-[11px] font-semibold"
            :class="STATUS_CLASS[item.node.status as FileStatus]"
            :title="statusText(item.node.status)"
          >{{ STATUS_LETTER[item.node.status as FileStatus] }}</span>
          <template v-else-if="item.node.type === 'folder'">
            <span
              v-if="item.node.status"
              aria-hidden="true"
              class="size-1.5 shrink-0 rounded-full bg-current"
              :class="STATUS_CLASS[item.node.status as FileStatus]"
              :title="t('explorer.folderChanged')"
            />
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3.5 shrink-0 text-dimmed transition-transform"
              :class="!open && '-rotate-90'"
            />
          </template>
        </template>
      </UTree>
    </div>

    <p
      v-if="!isRepo"
      class="border-t border-default px-3 py-1.5 text-xs text-muted"
    >
      {{ t('explorer.noRepo') }}
    </p>
    <p
      v-else
      class="flex flex-wrap gap-x-2 border-t border-default px-3 py-1.5 font-mono text-[11px] text-muted"
    >
      <span><span class="font-semibold text-warning">M</span> {{ statusText('modified') }}</span>
      <span><span class="font-semibold text-success">U</span> {{ statusText('untracked') }}</span>
      <span><span class="font-semibold text-success">A</span> {{ statusText('added') }}</span>
      <span><span class="font-semibold text-error">C</span> {{ statusText('conflicted') }}</span>
      <span><span class="font-semibold text-error">D</span> {{ statusText('deleted') }}</span>
      <span><span class="font-semibold text-dimmed">I</span> {{ statusText('ignored') }}</span>
    </p>
  </section>
</template>
