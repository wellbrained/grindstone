// The Web fundamentals environment's level types (ADR 0009; docs/features/levels.md "The Web fundamentals
// environment"): the Debugging sandbox (a small real app in a sealed frame, its files as the state, goals read from a
// check run) plus an editable server (`server.js`, run by the web backend) and a **prediction**: before the app runs, a
// card asks what will happen (pick one, order the lines, pick lines); answering runs the app and says who was right.
// A wrong prediction never blocks: it counts against the best run (fewest wrong predictions, then hints, then reloads).
// Registers the track `web` in the core's `Environments`, on Debugging's state and records (a prediction is one more
// counted action), so the Debugging play page and its engine run these levels too.
import type { DebugFields, DebugRecord, DebugState, DebugStep } from '../debugging/types'
import type { Level, PracticeTask, Scenario, Session } from '../types'

/**
 * Something the run of the starting files shows, which makes an option true (the tests check every option's fact
 * against what the app really does: `test/unit/levels/web/expected.ts`, proven in a browser by `e2e/web-levels.spec.ts`).
 * - `row`: a Network row, 'METHOD address status' ('GET https://api.cornerbakery.shop/menu CORS error'),
 * - `server`: an access line of server.js ('OPTIONS /orders 200'),
 * - `says`: a Console line starts with this,
 * - `asks`: a preflight asked about this header (its Access-Control-Request-Headers names it),
 * - `sent`: a request carried this cookie, 'METHOD address name' ('GET https://api.cornerbakery.shop/account session'),
 * - `stored`: the jar holds a cookie of this name once the run is over (the Application panel lists it),
 * - `refused`: the browser refused a cookie of this name (a Set-Cookie line, or a document.cookie write),
 * - `readable`: a script on the page can read a cookie of this name (document.cookie),
 * - `storage`: the page's own origin keeps this key once the run is over, 'local token' or 'session draft' (chapter 3:
 *   what a script on the page reads; the Application panel lists it),
 * - `replayed`: the thief's request from outside the browser got this answer, 'METHOD address status' (chapter 3; the
 *   Server panel shows it),
 * - `server` with `times`: that access line at least this often (chapter 4: a whole 200 again),
 * - `cdn`: a line of the CDN's log, 'who METHOD address OUTCOME' ('Sam GET https://api.cornerbakery.shop/account HIT';
 *   chapter 4, the Application panel's Cache shows it). A row the browser's cache answered reads '… 200 (disk cache)'.
 * - `painted`: a frame painted a watched element whose snapshot starts with this ('spinner', 'status: Thank you');
 *   chapter 5, the Event loop panel shows it,
 * - `forced`: the page's code forced a layout by this read ('offsetHeight'),
 * - `layouts`: the page's code forced exactly this many layouts in the run,
 * - `animated`: a transition or animation started, 'element property' ('p.toast.visible opacity'),
 * - `heard`: the screen reader said this line before the probes, 'kind: text' ('focus: button', 'state: expanded',
 *   'polite: Saved'); chapter 6, the Accessibility panel's reader shows it,
 * - `referer`: a request of the page carried this Referer, 'METHOD address referer' ('GET https://stats.example/hit
 *   https://cornerbakery.shop/'; 'none' for none). Chapter 7, the Network panel shows it.
 * - `probe` with `is`: a probe of the starting files read exactly this (Framework deep dives: what the page shows),
 * - `reaction`: Vue made a reaction of this kind or component ('watch', 'render Basket'), at least `times` (default 1)
 *   or, with `times: 0`, none (Framework deep dives, the Reactivity panel shows it).
 */
export type PredictionFact = { row: string } | { server: string, times?: number } | { says: string } | { asks: string } | { sent: string } | { stored: string } | { refused: string } | { readable: string } | { storage: string } | { replayed: string } | { cdn: string } | { painted: string } | { forced: string } | { layouts: number } | { animated: string } | { heard: string } | { referer: string } | { probe: string, is: string | number } | { reaction: string, times?: number }

/** One answer to choose, one line to order or to pick. */
export interface PredictionOption {
  id: string
  /** The option as the card shows it (Markdown-light: `code` in backticks). */
  text: string
  /** What the run shows when this option is what happens (an order question: the line it is). */
  fact?: PredictionFact
}

interface QuestionBase {
  id: string
  /** The question, with what the learner needs to answer it. */
  prompt: string
  /** The rule, in one sentence: shown with who was right. */
  rule: string
  options: readonly PredictionOption[]
}

/** Pick one: what happens (a radio group). */
export interface PickOneQuestion extends QuestionBase {
  form: 'one'
  /** The option that is right. */
  answer: string
}

/** Pick lines: which of these happen (a checkbox group; none is an answer too). */
export interface PickLinesQuestion extends QuestionBase {
  form: 'lines'
  /** Every option that is right (any order). */
  answer: readonly string[]
}

/** Order the lines: the order they come in (a list you reorder; the options are shown in their written order). */
export interface OrderQuestion extends QuestionBase {
  form: 'order'
  /** Every option, in the right order. */
  answer: readonly string[]
}

export type Question = PickOneQuestion | PickLinesQuestion | OrderQuestion

/** An answer: an option's id (pick one), or ids (pick lines: any order; order: in the order given). */
export type PredictionAnswer = string | readonly string[]

/** What a level asks before its app runs: a scenario one question, a practice task one or three. */
export interface Prediction {
  questions: readonly Question[]
}

/** What a Web fundamentals level adds to Debugging's fields. */
export interface WebFields extends DebugFields {
  prediction: Prediction
}

/** One step of a solution: a Debugging step, or the answer to the next question. */
export type WebStep = DebugStep | { predict: PredictionAnswer }

declare module '../types' {
  interface Environments {
    web: { state: DebugState, record: DebugRecord, step: WebStep, fields: WebFields }
    /** Framework deep dives (ADR 0010): the same environment, with real Vue in the sandbox instead of server.js. */
    frameworks: { state: DebugState, record: DebugRecord, step: WebStep, fields: WebFields }
  }
}

/** A level played with a prediction first: Web fundamentals' or Framework deep dives' (ADR 0010). */
export type WebLevel = Level<'web'> | Level<'frameworks'>
export type WebScenario = Scenario<'web'>
export type WebPracticeTask = PracticeTask<'web'>
export type WebSession = Session<'web'>
export type FrameworksScenario = Scenario<'frameworks'>
export type FrameworksPracticeTask = PracticeTask<'frameworks'>

/**
 * A level of the predict-then-fix mechanic: Web fundamentals' or Framework deep dives' (the play page runs both with
 * DebuggingPlay and the prediction card; what a level's sandbox brings decides its panels).
 */
export const isWebLevel = (level: Pick<Level, 'track'>): level is WebLevel => level.track === 'web' || level.track === 'frameworks'
