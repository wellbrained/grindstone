// Framework deep dives (ADR 0010): the Web fundamentals environment registered for a second track (web/types.ts), with
// real Vue in the sandbox (`sandbox.vue`) instead of server.js and the modelled browser.
import type { Level } from '../types'

export type { FrameworksPracticeTask, FrameworksScenario } from '../web/types'

export type FrameworksLevel = Level<'frameworks'>

/** A level of the Framework deep dives track. */
export const isFrameworksLevel = (level: Pick<Level, 'track'>): level is FrameworksLevel => level.track === 'frameworks'
