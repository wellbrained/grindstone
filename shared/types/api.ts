// Types in shared/types are auto-imported in both the app and the server.

/** One validation problem, as returned by `readZodBody` (server/utils/validation.ts). */
export interface ValidationIssue {
  path: string
  message: string
}
