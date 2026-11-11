// ValidationIssue is auto-imported from shared/types/api.ts
interface ApiErrorBody {
  statusMessage?: string
  message?: string
  data?: { issues?: ValidationIssue[] }
}

/**
 * Human-readable message from a failed $fetch/useFetch call (auto-imported from app/utils).
 * Prefers the first validation message sent by `readZodBody` on the server.
 */
export function getErrorMessage(error: unknown): string {
  const body = (error as { data?: ApiErrorBody } | null)?.data

  return body?.data?.issues?.[0]?.message
    ?? body?.statusMessage
    ?? (error instanceof Error ? error.message : String(error))
}
