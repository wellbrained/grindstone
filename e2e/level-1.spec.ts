import { expect, test } from '@playwright/test'

// Plays level 1 through the terminal like a player would and checks that the debrief shows up.
test('plays level 1 and sees the debrief', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('track-git-primary')).toHaveAttribute('data-action', 'start')
  await page.getByTestId('track-git-primary').click()

  await expect(page).toHaveURL(/\/git\/01-first-commit$/)
  await expect(page.getByRole('heading', { level: 1, name: 'First commit' })).toBeVisible()

  const input = page.getByRole('textbox', { name: /Terminal input/ })
  await expect(input).toBeFocused()

  const goals = page.locator('[data-goal]')
  await expect(goals).toHaveCount(3)
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(0)

  // Tab completion: "git ini" + Tab becomes "git init "
  await input.pressSequentially('git ini')
  await input.press('Tab')
  await expect(input).toHaveValue('git init ')
  await input.press('Enter')
  await expect(page.getByRole('log')).toContainText('Initialized empty Git repository')
  await expect(page.locator('[data-goal="initialised"]')).toHaveAttribute('data-met', 'true')

  // the graph is empty until the first commit
  await expect(page.getByText('No commits yet')).toBeVisible()

  await input.pressSequentially('git add .')
  await input.press('Enter')
  await input.pressSequentially('git commit -m "First commit"')
  await input.press('Enter')

  await expect(page.getByRole('dialog')).toContainText('Your project has a history')
  await expect(page.getByRole('dialog')).toContainText('Next level')
  await page.getByRole('button', { name: 'Stay here' }).click()

  // the graph shows the new commit with its branch label and the checklist is complete
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(3)
  await expect(page.getByRole('img', { name: /Commit graph with 1 commit/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /Commit graph/ })).toContainText('HEAD -> main')

  // progress is stored: the track page shows the level as solved and the next one as next up
  await page.goto('/git')
  await expect(page.locator('[data-level="git-01-first-commit"]')).toContainText('Solved')
  // next up is its first practice task, on the side branch
  await expect(page.locator('[data-level="git-practice-stage-one-file"]')).toHaveAttribute('data-state', 'next')
})
