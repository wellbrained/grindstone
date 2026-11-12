// Helpers of the progress backup file (ProgressBackup.vue): its name, and reading an uploaded file safely.
import { readProgress } from '../../shared/levels'
import type { Progress, ReadResult } from '../../shared/levels'

/** A real progress file is a few kB; anything past this is not one, and is not even read. */
export const MAX_BACKUP_BYTES = 1024 * 1024

/** `<site>-progress-YYYY-MM-DD.json` (the site name lower-cased and dashed), in the viewer's own date. */
export function backupFileName(siteName: string, now = new Date()): string {
  const two = (value: number) => String(value).padStart(2, '0')
  const slug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app'
  return `${slug}-progress-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.json`
}

export type BackupError = Extract<ReadResult, { ok: false }>['error'] | 'size' | 'read'

export type BackupRead = { ok: true, progress: Progress } | { ok: false, error: BackupError }

/** Checks the size first (so a huge file is never read into memory), then reads and parses it like stored progress. */
export async function readBackupFile(file: Pick<File, 'size' | 'text'>, now = Date.now()): Promise<BackupRead> {
  if (file.size > MAX_BACKUP_BYTES) return { ok: false, error: 'size' }
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: 'read' }
  }
  return readProgress(text, now)
}
