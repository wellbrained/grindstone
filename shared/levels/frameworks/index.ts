// The Framework deep dives track (ADR 0010): Vue reactivity, in six chapters. A practice task goes right after the scenario it trains (`practises`); defineTrack checks it.
import { fewestWrongPredictions } from '../progress'
import { defineTrack, trackLevels } from '../track'
import { isFrameworksLevel } from './types'
import type { FrameworksLevel } from './types'
import { rawBasket } from './01-raw-basket'
import { replacedBasket } from './02-replaced-basket'
import { specialProxy } from './03-special-proxy'
import { destructuredProps } from './04-destructured-props'
import { frozenBadge } from './05-frozen-badge'
import { passedValue } from './06-passed-value'
import { plainSetting } from './07-plain-setting'
import { sortingComputed } from './08-sorting-computed'
import { readonlyComputed } from './09-readonly-computed'
import { sameObject, whereUnwrapped, whichUpdate } from './practice/refs'
import { whatComposableGets, whatSetupReturns, whichStayLive } from './practice/destructuring'
import { howOften, whichRerun, writeComputed } from './practice/computed'
import { watchSource } from './10-watch-source'
import { shallowWatch } from './11-shallow-watch'
import { staleSearch } from './12-stale-search'
import { doesItFire, effectTracks, oldValue } from './practice/watchers'
import { oldDom } from './13-old-dom'
import { batchedHistory } from './14-batched-history'
import { chartBehind } from './15-chart-behind'
import { flushOrder, howManyRenders, whenDomChanges } from './practice/scheduling'
import { shallowMenu } from './16-shallow-menu'
import { privateFields } from './17-private-fields'
import { readonlyProp } from './18-readonly-prop'
import { readonlyView, shallowOrDeep, whatGetsProxy } from './practice/depth'

export const frameworksTrack = defineTrack({
  id: 'frameworks',
  title: 'Framework deep dives',
  shortTitle: 'Frameworks',
  scope: 'How a framework works inside, starting with Vue reactivity: refs, proxies, computed, watchers and the scheduler.',
  tagline: 'Predict what the framework does, then fix it.',
  description: 'How Vue\'s reactivity really works, on Corner Bakery\'s new Vue storefront. Before each app runs you predict what Vue will do: what the basket shows after a tap, which change renders, when a watcher fires, what the DOM says right after a change. Then read the Reactivity panel, which lists every render, computed and watcher run with what triggered it, and fix the code until the page does what it should. Real Vue runs in the sealed frame, so its rules and its warnings are Vue\'s own.',
  status: 'live',
  cheatSheet: '/frameworks/cheat-sheet',
  // fewest wrong predictions, then fewest hints, then fewest reloads (ADR 0010, as Web fundamentals)
  bestRun: fewestWrongPredictions,
  chapters: [
    {
      id: 'refs',
      title: 'ref & reactive',
      description: 'Proxies and the objects behind them, replacing what the template holds, where refs are unwrapped.',
      colour: 0,
      levels: [rawBasket, whichUpdate, replacedBasket, whereUnwrapped, specialProxy, sameObject]
    },
    {
      id: 'destructuring',
      title: 'Lost reactivity',
      description: 'Destructuring props and reactive objects, spreading them, passing `.value` on; `toRefs`, `toRef` and getters.',
      colour: 1,
      levels: [destructuredProps, whichStayLive, frozenBadge, whatSetupReturns, passedValue, whatComposableGets]
    },
    {
      id: 'computed',
      title: 'computed',
      description: 'Lazy and cached, tracking what the last run read, getters with side effects, `v-model` on a computed.',
      colour: 2,
      levels: [plainSetting, howOften, sortingComputed, whichRerun, readonlyComputed, writeComputed]
    },
    {
      id: 'watchers',
      title: 'watch & watchEffect',
      description: 'Watch sources, deep and shallow, old values of mutated objects, what watchEffect tracks, cleanup.',
      colour: 3,
      levels: [watchSource, doesItFire, shallowWatch, oldValue, staleSearch, effectTracks]
    },
    {
      id: 'scheduling',
      title: 'Scheduling & nextTick',
      description: 'Batched renders, the DOM before `nextTick`, a watcher\'s flush: pre, post and sync.',
      colour: 4,
      levels: [oldDom, whenDomChanges, batchedHistory, howManyRenders, chartBehind, flushOrder]
    },
    {
      id: 'depth',
      title: 'Shallow, raw & readonly',
      description: '`shallowRef` and `triggerRef`, class instances behind a proxy, `markRaw`, readonly props and events up.',
      colour: 5,
      levels: [shallowMenu, shallowOrDeep, privateFields, whatGetsProxy, readonlyProp, readonlyView]
    }
  ]
})

export const frameworksLevels: FrameworksLevel[] = trackLevels(frameworksTrack).filter(isFrameworksLevel)
