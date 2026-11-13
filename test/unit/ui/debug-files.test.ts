import { describe, expect, it } from 'vitest'
import { fileOrder } from '../../../app/utils/debug-files'

describe('fileOrder', () => {
  it('puts the page and its entry module first, the other modules by name, the stylesheet last', () => {
    expect(fileOrder(['style.css', 'money.js', 'cart.js', 'app.js', 'index.html', 'lib/dates.js', 'notes.md']))
      .toEqual(['index.html', 'app.js', 'cart.js', 'lib/dates.js', 'money.js', 'notes.md', 'style.css'])
  })
})
