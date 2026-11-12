// One confirmation dialog for the whole app (ConfirmDialog.vue, mounted in app.vue): every reset asks first and says
// exactly what it clears. Callers describe the question; the action only runs on confirm.
export interface ConfirmRequest {
  title: string
  /** What happens, in full: what gets cleared, and that it cannot be undone. */
  text: string
  confirmLabel: string
  /** A destructive action gets the error colour. */
  danger?: boolean
  onConfirm: () => void
}

export function useConfirm() {
  const request = useState<ConfirmRequest | null>('confirm-request', () => null)
  // the request stays readable while the dialog closes; `open` drives the modal
  const open = useState<boolean>('confirm-open', () => false)

  function ask(next: ConfirmRequest) {
    request.value = next
    open.value = true
  }

  function confirm() {
    const current = request.value
    open.value = false
    current?.onConfirm()
  }

  return { request, open, ask, confirm }
}
