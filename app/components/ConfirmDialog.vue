<script setup lang="ts">
// The app's one confirmation dialog (useConfirm): a title that asks, the full consequence, Cancel and the action.
// Cancel is focused first, so Enter never clears progress by accident.
const { request, open, confirm } = useConfirm()
const { t } = useI18n()
</script>

<template>
  <UModal
    v-model:open="open"
    :title="request?.title ?? ''"
    :description="request?.text ?? ''"
    :ui="{ content: 'sm:max-w-md', description: 'text-toned' }"
    data-testid="confirm-dialog"
  >
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          color="neutral"
          :label="t('confirm.cancel')"
          autofocus
          @click="open = false"
        />
        <UButton
          :color="request?.danger ? 'error' : 'primary'"
          :label="request?.confirmLabel ?? ''"
          data-testid="confirm-action"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
