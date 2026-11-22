import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { VUE_MODULE, vueFacade } from '../../../../shared/levels/frameworks/vue'

// The facade's reasons against the installed Vue (dev build, so onTrigger fires): what the Reactivity panel lists.
type Reaction = [kind: string, name: string, why: string[]]

async function loadFacade() {
  const reactions: Reaction[] = []
  const hook = `__gsReactionsTest${Math.random().toString(36).slice(2)}`
  ;(globalThis as Record<string, unknown>).window = { [hook]: (kind: string, name: string, why: string[]) => reactions.push([kind, name, why]) }
  const vue = pathToFileURL(createRequire(import.meta.url).resolve('vue')).href
  const file = join(mkdtempSync(join(tmpdir(), 'gs-facade-')), 'facade.mjs')
  writeFileSync(file, vueFacade(hook).replaceAll(`'${VUE_MODULE}'`, `'${vue}'`))
  const facade = await import(/* @vite-ignore */ pathToFileURL(file).href)
  return { facade, reactions }
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window
})

describe('the Vue facade', () => {
  it('names only the change that made a watch getter\'s result differ', async () => {
    const { facade, reactions } = await loadFacade()
    const count = facade.ref(1)
    facade.watch(() => count.value > 5, () => {}, { flush: 'sync' })
    count.value = 2 // the getter runs again, its result stays false: no callback
    count.value = 6
    expect(reactions).toEqual([['watch', '', ['set .value: 2 → 6']]])
  })

  it('still names what triggered a watch on a ref, and immediate', async () => {
    const { facade, reactions } = await loadFacade()
    const count = facade.ref(1)
    facade.watch(count, () => {}, { flush: 'sync', immediate: true })
    count.value = 3
    expect(reactions).toEqual([['watch', '', ['immediate']], ['watch', '', ['set .value: 1 → 3']]])
  })
})
