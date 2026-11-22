import { describe, expect, it } from 'vitest'
import { frameworksLevels } from '../../../../shared/levels'

// Guessing must not pay (review 2026-11-22): the right option of a pick-one question was second in 17 of 18
// scenarios, and both ordering tasks were solved by reversing the list as written.
const questions = frameworksLevels.flatMap(level =>
  (level as { prediction?: { questions: readonly { id: string, form: string, options: readonly { id: string }[], answer: string | readonly string[] }[] } })
    .prediction?.questions.map(question => ({ level: level.id, question })) ?? [])

describe('Framework deep dives answer positions', () => {
  it('spreads the right option of pick-one questions over the positions', () => {
    const picks = questions.filter(each => each.question.form === 'one')
    const counts = new Map<number, number>()
    for (const { question } of picks) {
      const at = question.options.findIndex(option => option.id === question.answer)
      expect(at).toBeGreaterThanOrEqual(0)
      counts.set(at, (counts.get(at) ?? 0) + 1)
    }
    for (const [at, count] of counts) expect(count / picks.length, `position ${at + 1}`).toBeLessThanOrEqual(0.4)
  })

  it('never shows an order question already in its order or its reverse', () => {
    for (const { level, question } of questions.filter(each => each.question.form === 'order')) {
      const shown = question.options.map(option => option.id).join()
      const answer = [...question.answer]
      expect(shown, `${level} ${question.id}`).not.toBe(answer.join())
      expect(shown, `${level} ${question.id}`).not.toBe(answer.reverse().join())
    }
  })
})
