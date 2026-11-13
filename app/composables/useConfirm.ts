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
  /**
   * After the action ran and the dialog closed, where the focus goes instead of the button that opened it (the action
   * may have removed that button: a Roll back to the version you now have).
   */
  focusAfter?: () => void
}

export function useConfirm() {
  const request = useState<ConfirmRequest | null>('confirm-request', () => null)
  // the request stays readable while the dialog closes; `open` drives the modal
  const open = useState<boolean>('confirm-open', () => false)
  /** The action of the open request ran (the dialog's focus then goes to `focusAfter`). */
  const confirmed = useState<boolean>('confirm-confirmed', () => false)

  function ask(next: ConfirmRequest) {
    request.value = next
    confirmed.value = false
    open.value = true
  }

  function confirm() {
    const current = request.value
    confirmed.value = true
    open.value = false
    current?.onConfirm()
  }

  return { request, open, confirmed, ask, confirm }
}
