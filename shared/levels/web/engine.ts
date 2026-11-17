// The Web fundamentals environment on the shared core (ADR 0009; docs/features/levels.md "The Web fundamentals
// environment"): Debugging's actions (Save, Reload, …; its engine takes these levels as they are) plus one more
// counted action, an answer to the level's prediction. An answer is recorded with whether it was right; a wrong one
// adds 1 to the attempt's `wrongPredictions` (the first count of the best run) and never blocks. Pure and immutable.
import { act, startSession } from '../engine'
import { playStep as playDebugStep } from '../debugging/engine'
import type { CheckRun } from '../debugging/engine'
import type { DebugOutput, DebugResult, DebugSession, DebugState } from '../debugging/types'
import type { PredictionAnswer, Question, WebLevel, WebStep } from './types'

const quiet = (session: DebugSession): DebugResult => ({ session, output: { verdict: null }, notices: [], solvedNow: false })

/** A fresh session: the level's files, nothing observed, nothing predicted yet. */
export const startWebLevel = (level: WebLevel): DebugSession => startSession(level)

const ids = (question: Question) => question.options.map(option => option.id)
const isList = (answer: PredictionAnswer): answer is readonly string[] => Array.isArray(answer)

/**
 * An answer of the question's shape: an option's id (pick one), known ids once each (pick lines, none is an answer
 * too) or every id once (order the lines).
 */
export function isAnswerTo(question: Question, answer: PredictionAnswer): boolean {
  const known = ids(question)
  if (question.form === 'one') return typeof answer === 'string' && known.includes(answer)
  if (!isList(answer) || new Set(answer).size !== answer.length || !answer.every(id => typeof id === 'string' && known.includes(id))) return false
  return question.form === 'lines' || answer.length === known.length
}

/** The answer is the right one: the option (pick one), the same set (pick lines), the same order (order the lines). */
export function isRight(question: Question, answer: PredictionAnswer): boolean {
  if (!isAnswerTo(question, answer)) return false
  if (question.form === 'one') return answer === question.answer
  const given = answer as readonly string[]
  if (question.form === 'order') return given.every((id, index) => question.answer[index] === id)
  return given.length === question.answer.length && given.every(id => question.answer.includes(id))
}

/** The answers given so far, in question order. */
export const answersOf = (state: DebugState): readonly PredictionAnswer[] => state.predicted ?? []

/** The index of the next question to answer; null once every question is answered. */
export function nextQuestion(level: WebLevel, state: DebugState): number | null {
  const at = answersOf(state).length
  return at < level.prediction.questions.length ? at : null
}

/** Every question is answered: the app may run. */
export const predictionDone = (level: WebLevel, state: DebugState): boolean => nextQuestion(level, state) === null

/** The answer as stored: an id, or a copy of the ids (pick lines in the options' order, so a set reads the same). */
function stored(question: Question, answer: PredictionAnswer): PredictionAnswer {
  if (question.form === 'one') return answer
  const given = answer as readonly string[]
  return question.form === 'lines' ? ids(question).filter(id => given.includes(id)) : [...given]
}

/**
 * Answers the next question (counted; a wrong answer adds 1 to `wrongPredictions`, a right one 0). An answer of the
 * wrong shape, or one after the last question, changes nothing. The verdict says whether it was right.
 */
export function predict(session: DebugSession, level: WebLevel, answer: PredictionAnswer): DebugResult {
  const index = nextQuestion(level, session.state)
  const question = index === null ? undefined : level.prediction.questions[index]
  if (index === null || !question || !isAnswerTo(question, answer)) return quiet(session)
  const right = isRight(question, answer)
  const output: DebugOutput = { verdict: { right, why: null } }
  return act(session, level, {
    commands: ['predict'],
    wrongPredictions: right ? 0 : 1,
    execute: state => ({ state: { ...state, predicted: [...answersOf(state), stored(question, answer)] }, record: { kind: 'predict', question: index, right }, output })
  })
}

/** Plays one solution step: an answer, or a Debugging step (a reload runs the check on the saved files first). */
export async function playWebStep(session: DebugSession, level: WebLevel, step: WebStep, run: CheckRun): Promise<DebugResult> {
  if (typeof step === 'object' && 'predict' in step) return predict(session, level, step.predict)
  return playDebugStep(session, level, step, run)
}

/** Replays the level's solution from a fresh session (the tests prove with it that every level is solvable). */
export async function playWebSolution(level: WebLevel, run: CheckRun): Promise<DebugResult[]> {
  const results: DebugResult[] = []
  let session = startWebLevel(level)
  for (const step of level.solution) {
    const result = await playWebStep(session, level, step, run)
    results.push(result)
    session = result.session
  }
  return results
}
