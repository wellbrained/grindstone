// Structure of the Framework deep dives cheat sheet (/frameworks/cheat-sheet): one group per chapter, the entries in each
// (a rule and the lines that apply it), and Vue's warnings the levels show in Vue's own words (data, not translated),
// plus the levels that teach each. Every visible text lives in the i18n locales under `fwCheat.*`; the key helpers below
// say where. The same frame as the Web fundamentals sheet (docs/features/ui.md, "Framework deep dives cheat sheet").
import type { CheatSource } from './cheat-sheet'
import { webCheatLevels } from './web-cheatsheet'
import type { BrowserMessage, WebCheatExample, WebCheatGroup } from './web-cheatsheet'

const line = (text: string): WebCheatExample => ({ line: text })

export const fwCheatGroups: WebCheatGroup[] = [
  {
    id: 'refs',
    entries: [
      { id: 'proxy', examples: [line('const basket = reactive({ lines: [] })'), line('basket.lines.push(line)')], levels: ['frameworks-01-raw-basket'] },
      { id: 'replace', examples: [line('basket.lines = []'), line('const basket = ref({ lines: [] })'), line('basket.value = { lines: [] }')], levels: ['frameworks-02-replaced-basket'] },
      { id: 'identity', examples: [line('item.id === SPECIAL.id'), line('toRaw(item) === SPECIAL')], levels: ['frameworks-03-special-proxy'] },
      { id: 'ref-or-reactive', examples: [line('const selected = ref(null)'), line('const basket = reactive({ lines: [] })')], levels: [] },
      { id: 'unwrap', examples: [line('{{ count + 1 }}'), line('{{ state.count + 1 }}'), line('{{ list[0].value + 1 }}')], levels: [] }
    ]
  },
  {
    id: 'destructuring',
    entries: [
      { id: 'props', examples: [line('computed(() => props.price * props.quantity)'), line('const { price, quantity } = toRefs(props)')], levels: ['frameworks-04-destructured-props'] },
      { id: 'to-refs', examples: [line('const { count } = toRefs(useBasket())'), line('const count = toRef(basket, \'count\')')], levels: ['frameworks-05-frozen-badge'] },
      { id: 'pass-ref', examples: [line('useDeliveryFee(total)'), line('useDeliveryFee(() => total.value)'), line('computed(() => toValue(amount) >= 10 ? 0 : 3.5)')], levels: ['frameworks-06-passed-value'] }
    ]
  },
  {
    id: 'computed',
    entries: [
      { id: 'tracked', examples: [line('export const settings = reactive({ takeaway: true })')], levels: ['frameworks-07-plain-setting'] },
      { id: 'lazy', examples: [line('const total = computed(() => lines.reduce(addPrice, 0))')], levels: [] },
      { id: 'pure', examples: [line('computed(() => [...lines].sort(byPrice))'), line('computed(() => lines.toSorted(byPrice))')], levels: ['frameworks-08-sorting-computed'] },
      { id: 'writable', examples: [line('computed({ get: () => line.quantity, set: value => { line.quantity = value } })')], levels: ['frameworks-09-readonly-computed'] }
    ]
  },
  {
    id: 'watchers',
    entries: [
      { id: 'source', examples: [line('watch(() => stock.croissant, (left) => { … })'), line('watch([a, () => state.b], ([a, b]) => { … })')], levels: ['frameworks-10-watch-source'] },
      { id: 'deep', examples: [line('watch(basket, save, { deep: true })'), line('watch(() => basket.value.lines.length, save)')], levels: ['frameworks-11-shallow-watch'] },
      { id: 'old-value', examples: [line('watch(() => [...list], (now, before) => { … })')], levels: [] },
      { id: 'cleanup', examples: [line('let stale = false'), line('onWatcherCleanup(() => { stale = true })'), line('if (!stale) results.value = found')], levels: ['frameworks-12-stale-search'] },
      { id: 'effect-tracks', examples: [], levels: [] }
    ]
  },
  {
    id: 'scheduling',
    entries: [
      { id: 'next-tick', examples: [line('await nextTick()')], levels: ['frameworks-13-old-dom'] },
      { id: 'batching', examples: [line('watch(quantity, record, { flush: \'sync\' })')], levels: ['frameworks-14-batched-history'] },
      { id: 'flush', examples: [line('watch(source, draw, { flush: \'post\' })'), line('watchPostEffect(() => draw())')], levels: ['frameworks-15-chart-behind'] }
    ]
  },
  {
    id: 'depth',
    entries: [
      { id: 'shallow-ref', examples: [line('catalogue.value = catalogue.value.map(update)'), line('triggerRef(catalogue)')], levels: ['frameworks-16-shallow-menu'] },
      { id: 'raw', examples: [line('const basket = shallowRef(new Basket())'), line('reactive({ chart: markRaw(chart) })')], levels: ['frameworks-17-private-fields'] },
      { id: 'props-down', examples: [line('$emit(\'update:quantity\', quantity + 1)'), line('<QuantityPicker v-model:quantity="line.quantity" />')], levels: ['frameworks-18-readonly-prop'] }
    ]
  }
]

/** Vue's warnings and errors as the levels show them in the Console. */
export const vueMessages: BrowserMessage[] = [
  { id: 'invalid-source', message: '[Vue warn]: Invalid watch source:  5 A watch source can only be a getter/effect function, a ref, a reactive object, or an array of these types.', levels: ['frameworks-10-watch-source'] },
  { id: 'computed-readonly', message: '[Vue warn] Write operation failed: computed value is readonly', levels: ['frameworks-09-readonly-computed'] },
  { id: 'mutate-prop', message: '[Vue warn]: Attempting to mutate prop "quantity". Props are readonly.', levels: ['frameworks-18-readonly-prop'] },
  { id: 'target-readonly', message: '[Vue warn] Set operation on key "count" failed: target is readonly.', levels: [] },
  { id: 'private-member', message: 'Uncaught TypeError: Cannot read private member #lines from an object whose class did not declare it', levels: ['frameworks-17-private-fields'] },
  { id: 'recursive', message: '[Vue warn]: Maximum recursive updates exceeded in component <Basket>. This means you have a reactive effect that is mutating its own dependencies and thus recursively triggering itself.', levels: [] }
]

/** i18n key of a group's title (the warnings have one too: id `messages`). */
export const fwGroupKey = (groupId: string) => `fwCheat.groups.${groupId}`
export const fwTitleKey = (entryId: string) => `fwCheat.entries.${entryId}.title`
export const fwRuleKey = (entryId: string) => `fwCheat.entries.${entryId}.rule`
export const fwSummaryKey = (entryId: string) => `fwCheat.entries.${entryId}.summary`
export const fwNoteKey = (entryId: string, index: number) => `fwCheat.entries.${entryId}.examples.${index}`
export const fwMessageKey = (messageId: string, part: 'means' | 'look') => `fwCheat.messages.${messageId}.${part}`

/** The sheet's data and where its texts live, for the page to turn into cards (`buildCheatSheet`). */
export const fwCheatSource: CheatSource = {
  groups: fwCheatGroups,
  messages: vueMessages,
  messagesId: 'messages',
  keys: {
    group: fwGroupKey,
    title: fwTitleKey,
    rule: fwRuleKey,
    summary: fwSummaryKey,
    note: fwNoteKey,
    means: messageId => fwMessageKey(messageId, 'means'),
    look: messageId => fwMessageKey(messageId, 'look')
  },
  labels: { why: 'fwCheat.why', look: 'fwCheat.look' },
  levels: ids => webCheatLevels(ids)
}
