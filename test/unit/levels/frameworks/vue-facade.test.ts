import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Window } from 'happy-dom'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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

// Vue's DOM renderer takes document when it first loads, so the page exists before any test imports Vue.
const dom = new Window()
const globals = globalThis as Record<string, unknown>
beforeAll(() => {
  globals.document = dom.document
  globals.SVGElement = dom.SVGElement
  globals.Element = dom.Element
})

afterAll(async () => {
  delete globals.document
  delete globals.SVGElement
  delete globals.Element
  await dom.happyDOM.close()
})

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

  it('names a changed prop the render never read, and says when nothing reactive changed', async () => {
    const { facade, reactions } = await loadFacade()
    const price = facade.ref(2)
    const note = facade.ref('fresh')
    const instances: { $forceUpdate: () => void }[] = []
    const Line = {
      name: 'Line',
      props: { price: Number, note: String },
      setup: (props: { price: number }) => () => facade.h('p', String(props.price)),
      mounted() {
        instances.push(this as unknown as { $forceUpdate: () => void })
      }
    }
    const root = dom.document.createElement('div')
    facade.createApp({ name: 'Root', setup: () => () => facade.h(Line, { price: price.value, note: note.value }) }).mount(root)
    price.value = 3 // read in the render: Vue's own trigger names it
    await facade.nextTick()
    note.value = 'sold out' // never read: Vue re-renders for the new props without a trigger
    await facade.nextTick()
    instances[0]!.$forceUpdate()
    await facade.nextTick()
    expect(reactions.filter(reaction => reaction[1] === 'Line')).toEqual([
      ['render', 'Line', ['mount']],
      ['render', 'Line', ['set .price: 2 → 3']],
      ['render', 'Line', ['prop note: "fresh" → "sold out"']],
      ['render', 'Line', ['no reactive change (slots or $forceUpdate)']]
    ])
  })
})
