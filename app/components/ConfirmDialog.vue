<script setup lang="ts">
// The app's one confirmation dialog (useConfirm): a title that asks, the full consequence, Cancel and the action.
// Cancel is focused first, so Enter never clears progress by accident.
const { request, open, confirmed, confirm } = useConfirm()
const { t } = useI18n()

// after the action, a request may say where the focus goes (the button that opened the dialog may be gone)
function onCloseAutoFocus(event: Event) {
  const focusAfter = request.value?.focusAfter
  if (!confirmed.value || !focusAfter) return
  event.preventDefault()
  focusAfter()
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="request?.title ?? ''"
    :description="request?.text ?? ''"
    :ui="{ content: 'sm:max-w-md', description: 'text-toned' }"
    :content="{ onCloseAutoFocus }"
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
