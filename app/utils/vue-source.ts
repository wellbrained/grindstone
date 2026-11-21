// Framework deep dives (ADR 0010): Vue's development ESM browser build as the sealed frame gets it, in a chunk of its
// own that only a Framework deep dives level loads (useDebuggingPlay imports this module lazily).
import source from 'vue/dist/vue.esm-browser.js?raw'
import { prepareVue } from '../../shared/levels/frameworks/vue'

let prepared: string | null = null

/** The build with its start-up notice taken out (prepared once). */
export function vueBuild(): string {
  prepared ??= prepareVue(source)
  return prepared
}
