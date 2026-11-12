import { expect, test } from '@playwright/test'

// Plays 4.4 Tidy up before review (Terminal layout): `git rebase -i main` opens the todo list in the editor dialog,
// Cancel aborts the rebase and hands the focus back to the terminal, then the list is edited (reword, fixup, fixup),
// Start rebase opens the commit message, Save message finishes the rebase and the debrief shows up.
test('tidies up three commits with an interactive rebase through the editor', async ({ page }) => {
  await page.goto('/git/25-tidy-up-before-review')
  await expect(page.getByRole('heading', { level: 1, name: 'Tidy up before review' })).toBeVisible()

  const input = page.getByRole('textbox', { name: /Terminal input/ })
  const log = page.getByRole('log')
  const run = async (line: string) => {
    await input.click()
    await input.pressSequentially(line)
    await input.press('Enter')
  }

  // Cancel runs git rebase --abort; nothing has moved
  await run('git rebase -i main')
  const dialog = page.getByRole('dialog', { name: 'git opened git-rebase-todo' })
  await expect(dialog).toBeVisible()
  await expect(log).toContainText('hint: Waiting for your editor to close the file...')
  const todo = dialog.getByRole('textbox', { name: 'Contents of .git/rebase-merge/git-rebase-todo' })
  await expect(todo).toBeFocused()
  await expect(todo).toContainText('pick')
  await expect(todo).toContainText('Add gift card product page')
  // Escape does not cancel it
  await todo.press('Escape')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel the rebase (git rebase --abort)' }).click()
  await expect(dialog).toBeHidden()
  await expect(log).toContainText('git rebase --abort')
  await expect(input).toBeFocused()

  // the real run: the ids come from the list git wrote
  await run('git rebase -i main')
  await expect(todo).toBeFocused()
  const text = await todo.innerText()
  const ids = [...text.matchAll(/^pick ([0-9a-f]{7}) /gm)].map(match => match[1])
  expect(ids).toHaveLength(3)
  await todo.press('ControlOrMeta+a')
  await page.keyboard.insertText(`reword ${ids[0]} Add gift card product page\nfixup ${ids[1]} wip\nfixup ${ids[2]} fix typo\n`)
  await dialog.getByRole('button', { name: 'Start rebase' }).click()

  // git asks for the message of the reworded commit
  const messageDialog = page.getByRole('dialog', { name: 'git opened COMMIT_EDITMSG' })
  const message = messageDialog.getByRole('textbox', { name: 'Contents of .git/COMMIT_EDITMSG' })
  await expect(message).toBeVisible()
  await expect(message).toContainText('Add gift card product page')
  await expect(message).toContainText('# Please enter the commit message')
  await message.press('ControlOrMeta+a')
  await page.keyboard.insertText('Add gift cards to the shop\n')
  await messageDialog.getByRole('button', { name: 'Save message' }).click()

  await expect(log).toContainText('Successfully rebased and updated refs/heads/feature/gift-cards.')
  await expect(page.getByRole('dialog')).toContainText('History is for the reader')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(3)
  await expect(input).toBeFocused()
})
