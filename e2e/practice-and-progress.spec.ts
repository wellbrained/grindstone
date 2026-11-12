import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Practice tasks (Next and Again), the ⋯ menus with "practise again" and a chapter reset, and the progress backup on the
// About page (docs/adr/0006-git-v1-practice-and-progress.md).

const terminal = (page: Page) => page.getByRole('textbox', { name: /Terminal input/ })

async function type(page: Page, line: string) {
  await terminal(page).pressSequentially(line)
  await terminal(page).press('Enter')
}

/** Solves 1.1 and the practice task "Stage only app.js" through the terminal. */
async function solveTwo(page: Page) {
  await page.goto('/git/01-first-commit')
  await expect(terminal(page)).toBeFocused()
  for (const line of ['git init', 'git add .', 'git commit -m "First commit"']) await type(page, line)
  await expect(page.getByRole('dialog')).toContainText('Your project has a history')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await page.goto('/git/practice-stage-one-file')
  await type(page, 'git add app.js')
  await expect(page.getByTestId('practice-solved')).toBeVisible()
}

test('solves a practice task, then plays it again', async ({ page }) => {
  await page.goto('/git/practice-stage-one-file')
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(crumbs).toContainText('Basics')
  await expect(crumbs).toContainText('1.1 First commit')
  await expect(crumbs).not.toContainText('Stage only app.js')
  await expect(page.getByRole('heading', { level: 1, name: 'Stage only app.js' })).toBeVisible()
  await expect(page.getByText('Practice · ~30 s')).toBeVisible()

  // the one hint shows in place
  await page.getByRole('button', { name: 'Show hint' }).click()
  await expect(page.getByTestId('practice-hint')).toContainText('git add <file>')

  await type(page, 'git add app.js')
  const solved = page.getByTestId('practice-solved')
  await expect(solved).toBeVisible()
  await expect(page.locator('[data-goal="staged"]')).toHaveAttribute('data-met', 'true')
  // no debrief dialog for a practice task: Next and Again are right there
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(solved.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/git/practice-commit-all')

  await solved.getByRole('button', { name: 'Again' }).click()
  await expect(solved).toHaveCount(0)
  await expect(page.locator('[data-goal="staged"]')).toHaveAttribute('data-met', 'false')
  await expect(terminal(page)).toBeFocused()
  // it stays solved on the track page, with its best run
  await page.goto('/git')
  const row = page.locator('[data-level="git-practice-stage-one-file"]')
  await expect(row).toHaveAttribute('data-state', 'solved')
  await expect(row.getByTestId('row-status')).toContainText(/Solved\W+best 1 cmd/)
})

test('marks an entry "practise again" and resets a chapter through the menus', async ({ page }) => {
  await solveTwo(page)
  await page.goto('/git')
  const row = page.locator('[data-level="git-practice-stage-one-file"]')
  await expect(row).toHaveAttribute('data-state', 'solved')

  await page.getByRole('button', { name: 'More for Stage only app.js' }).click()
  await page.getByRole('menuitemcheckbox', { name: /practise again/ }).click()
  await expect(row.getByTestId('row-status')).toContainText('Practise again')

  // the chapter menu starts the first flagged entry
  await page.getByRole('button', { name: 'More for chapter Basics' }).click()
  await expect(page.getByRole('menuitem', { name: 'Practise again: Basics' })).toBeEnabled()
  await page.getByRole('menuitem', { name: /Reset chapter Basics/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Reset chapter Basics?')
  await expect(dialog).toContainText('2 solved levels')
  await expect(dialog).toContainText('This cannot be undone.')
  // Cancel changes nothing
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(row).toHaveAttribute('data-state', 'solved')

  await page.getByRole('button', { name: 'More for chapter Basics' }).click()
  await page.getByRole('menuitem', { name: /Reset chapter Basics/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset chapter' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-level="git-01-first-commit"]')).toHaveAttribute('data-state', 'next')
  await expect(row).toHaveAttribute('data-state', 'open')
  await expect(row.getByTestId('row-status')).not.toContainText('Practise again')
  await expect(page.getByTestId('track-progress')).toHaveText('0 of 38 solved')
  // the play session starts fresh too
  await page.goto('/git/practice-stage-one-file')
  await expect(page.getByTestId('practice-solved')).toHaveCount(0)
})

test('downloads the progress and loads it back', async ({ page }) => {
  await solveTwo(page)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'About' }).click()
  const section = page.getByTestId('your-progress')
  await expect(section).toContainText('2 solved, 0 to practise again')

  const [download] = await Promise.all([page.waitForEvent('download'), section.getByRole('button', { name: 'Download progress' }).click()])
  expect(download.suggestedFilename()).toMatch(/^grindstone-progress-\d{4}-\d{2}-\d{2}\.json$/)
  const file = await download.path()
  const saved = JSON.parse(await readFile(file, 'utf8'))
  expect(saved.version).toBe(3)
  expect(Object.keys(saved.levels)).toEqual(expect.arrayContaining(['git-01-first-commit', 'git-practice-stage-one-file']))

  // reset everything, through its dialog
  await section.getByRole('button', { name: 'Reset everything…' }).click()
  await expect(page.getByRole('dialog')).toContainText('Reset everything?')
  await page.getByRole('dialog').getByRole('button', { name: 'Reset everything' }).click()
  await expect(section).toContainText('Nothing saved yet.')

  // a file that is not progress changes nothing and says why
  await page.getByTestId('load-progress-file').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
  await expect(page.getByTestId('backup-message')).toContainText('notes.json is not a Grindstone progress file. Nothing was changed.')
  await expect(section).toContainText('Nothing saved yet.')

  await page.getByTestId('load-progress-file').setInputFiles(file)
  await expect(page.getByTestId('backup-message')).toContainText('Loaded')
  await expect(page.getByTestId('backup-message')).toContainText('2 solved, 0 to practise again')
  await expect(section).toContainText('2 solved, 0 to practise again')

  await page.goto('/git')
  await expect(page.locator('[data-level="git-practice-stage-one-file"]')).toHaveAttribute('data-state', 'solved')
})
