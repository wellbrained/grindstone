import { expect, test } from '@playwright/test'

// Plays level 4 (merge conflict) in the IDE layout (the panels open in place, nothing else moves): merge in the bottom terminal, open the file from the explorer,
// resolve with "Accept both", save with Ctrl+S, then add and commit, and see the debrief.
test('plays level 4 in the IDE layout with the conflict actions', async ({ page }) => {
  await page.goto('/git/04-merge-conflict')
  await expect(page.getByRole('heading', { level: 1, name: 'Merge conflict' })).toBeVisible()

  // switch the layout; the choice is remembered. Panels open in place: the switch, the level and the graph do not move.
  const graph = page.getByRole('region', { name: 'Commit graph' })
  const heading = page.getByRole('heading', { level: 1 })
  const ideRadio = page.getByRole('radio', { name: 'IDE' })
  const before = [await ideRadio.boundingBox(), await heading.boundingBox(), await graph.boundingBox()]
  await ideRadio.click()
  await expect(ideRadio).toHaveAttribute('aria-checked', 'true')
  const explorer = page.getByRole('region', { name: 'Files in the working tree' })
  // a closed panel is clipped to 0px and inert, so check that it really opened
  await expect(page.locator('.reveal-files')).toHaveAttribute('data-open', /.*/)
  await expect(page.locator('.reveal-editor')).not.toHaveAttribute('inert')
  await expect.poll(async () => (await page.locator('.reveal-files').boundingBox())?.height ?? 0).toBeGreaterThan(100)
  await expect(explorer).toBeVisible()
  expect([await ideRadio.boundingBox(), await heading.boundingBox(), await graph.boundingBox()]).toEqual(before)
  expect(await page.evaluate(() => window.localStorage.getItem('grindstone:layout'))).toBe('ide')

  const input = page.getByRole('textbox', { name: /Terminal input/ })
  await input.click()
  await input.pressSequentially('git merge feature/footer')
  await input.press('Enter')
  await expect(page.getByRole('log')).toContainText('CONFLICT (content): Merge conflict in src/footer.ts')

  // the explorer marks the file as conflicted (letter and text, not colour alone) and opens it in a tab
  const file = explorer.locator('[data-file="src/footer.ts"]')
  await expect(explorer.getByRole('treeitem', { name: /footer\.ts \(conflicted\)/ })).toBeVisible()
  await file.click()
  const tab = page.locator('[data-tab="src/footer.ts"]')
  await expect(tab).toBeVisible()

  const editor = page.getByRole('textbox', { name: 'Contents of src/footer.ts' })
  await expect(editor).toContainText('<<<<<<< HEAD')
  await page.getByRole('button', { name: 'Conflict 1: accept both changes' }).click()
  await expect(editor).not.toContainText('<<<<<<<')
  await expect(editor).toContainText('open daily 7 to 18')
  await expect(editor).toContainText('hello@cornerbakery.example')
  await expect(tab).toContainText('unsaved changes')

  await editor.press('ControlOrMeta+s')
  await expect(page.getByRole('log')).toContainText('Saved src/footer.ts.')
  await expect(tab).not.toContainText('unsaved changes')

  await input.click()
  await input.pressSequentially('git add src/footer.ts')
  await input.press('Enter')
  await expect(explorer.getByRole('treeitem', { name: /footer\.ts \(modified\)/ })).toBeVisible()
  await input.pressSequentially('git commit --no-edit')
  await input.press('Enter')

  await expect(page.getByRole('dialog')).toContainText('You decided, git recorded it')
  await page.getByRole('button', { name: 'Stay here' }).click()
  await expect(page.locator('[data-goal][data-met="true"]')).toHaveCount(3)

  // the layout survives a reload
  await page.reload()
  await expect(page.getByRole('radio', { name: 'IDE' })).toHaveAttribute('aria-checked', 'true')
})
