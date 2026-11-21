<script setup lang="ts">
import { isRight, nextQuestion } from '#shared/levels'
import type { PredictionAnswer, Question } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'
import { plainText } from '~/utils/inline-text'

// The prediction card of a Web fundamentals level (ADR 0009, docs/features/ui.md "Web fundamentals play page"): before
// the app runs, a form asks one question (a practice task: one or three) in one of three forms: pick one (a radio
// group), pick lines (a checkbox group, none is an answer too) or order the lines (a list reordered with its Up and Down
// buttons, every move said in a live region). Answering shows who was right, with one sentence on the rule, and the
// focus goes to that verdict; a wrong answer never blocks. The last answer starts the app. Text only.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { webLevel, session, predict, predicting } = props.play
const questions = computed<readonly Question[]>(() => webLevel?.prediction.questions ?? [])
const answers = computed<readonly PredictionAnswer[]>(() => session.value.state.predicted ?? [])
const current = computed(() => webLevel ? nextQuestion(webLevel, session.value.state) : null)
const question = computed(() => current.value === null ? null : questions.value[current.value] ?? null)

// the form's own state, for the question on screen (a new question starts it over)
const choice = ref<string | null>(null)
const lines = ref<string[]>([])
const order = ref<string[]>([])
const moved = ref('')
watch(question, (next) => {
  choice.value = null
  lines.value = []
  order.value = next?.options.map(option => option.id) ?? []
  moved.value = ''
}, { immediate: true })

const optionOf = (item: Question, id: string) => item.options.find(option => option.id === id)
/** An option's text without its marks (for names that are read out). */
const plain = plainText
const valid = computed(() => question.value?.form !== 'one' || choice.value !== null)
const last = computed(() => current.value !== null && current.value === questions.value.length - 1)

/** Up or Down on a line of an order question: it swaps with its neighbour, the move is said, the focus stays on it. */
function move(id: string, by: -1 | 1) {
  const from = order.value.indexOf(id)
  const to = from + by
  if (from < 0 || to < 0 || to >= order.value.length) return
  const next = [...order.value]
  next.splice(from, 1)
  next.splice(to, 0, id)
  order.value = next
  const item = question.value ? optionOf(question.value, id) : undefined
  moved.value = t('web.prediction.moved', { line: plain(item?.text ?? id), n: to + 1, total: next.length })
  // the same button, or the other one where this one can't go further
  const edge = to === 0 || to === next.length - 1
  nextTick(() => {
    const row = list.value?.querySelector<HTMLElement>(`[data-line="${CSS.escape(id)}"]`)
    const same = row?.querySelector<HTMLButtonElement>(`[data-move="${by}"]`)
    ;(edge && same?.disabled ? row?.querySelector<HTMLButtonElement>(`[data-move="${-by}"]`) : same)?.focus()
  })
}

const list = useTemplateRef<HTMLElement>('list')
const results = useTemplateRef<HTMLElement>('results')

function submit() {
  const item = question.value
  if (!item || !valid.value) return
  const answer: PredictionAnswer = item.form === 'one' ? choice.value! : item.form === 'lines' ? [...lines.value] : [...order.value]
  const index = current.value!
  if (!predict(answer)) return
  // the verdict of what was just answered takes the focus (a screen reader reads who was right, and the rule)
  nextTick(() => results.value?.querySelector<HTMLElement>(`[data-result="${index}"]`)?.focus())
}

/** What an answer said, as text: an option, the picked lines, the order. */
function answerText(item: Question, answer: PredictionAnswer): string[] {
  const ids = typeof answer === 'string' ? [answer] : [...answer]
  return ids.map(id => optionOf(item, id)?.text ?? id)
}
const rightText = (item: Question) => answerText(item, item.answer)
</script>

<template>
  <section
    v-if="webLevel"
    aria-labelledby="prediction-heading"
    class="rounded-lg border border-default bg-elevated p-3"
    data-testid="prediction"
  >
    <h2
      id="prediction-heading"
      class="flex items-center gap-1.5 font-mono text-xs font-medium text-muted"
    >
      <UIcon
        name="i-lucide-telescope"
        class="size-3.5"
      />
      {{ predicting ? t('web.prediction.title') : t('web.prediction.done') }}
    </h2>

    <!-- every answer so far: who was right, and the rule -->
    <ol
      v-if="answers.length"
      ref="results"
      class="mt-2 space-y-3"
    >
      <li
        v-for="(answer, index) in answers"
        :key="index"
        class="text-sm"
      >
        <template v-if="questions[index]">
          <div
            :data-result="index"
            role="group"
            :aria-labelledby="`prediction-verdict-${index}`"
            :aria-describedby="`prediction-rule-${index}`"
            tabindex="-1"
            class="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            data-testid="prediction-result"
            :data-right="isRight(questions[index]!, answer)"
          >
            <p
              v-if="questions.length > 1"
              class="font-mono text-xs text-muted tabular-nums"
            >
              {{ t('web.prediction.question', { n: index + 1, total: questions.length }) }}
            </p>
            <p class="text-toned">
              <InlineText :text="questions[index]!.prompt" />
            </p>
            <p class="mt-1 flex items-start gap-1.5">
              <UIcon
                :name="isRight(questions[index]!, answer) ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
                class="mt-0.5 size-4 shrink-0"
                :class="isRight(questions[index]!, answer) ? 'text-success' : 'text-warning'"
              />
              <span
                :id="`prediction-verdict-${index}`"
                class="font-medium text-highlighted"
              >{{ isRight(questions[index]!, answer) ? t('web.prediction.right') : t('web.prediction.wrong') }}</span>
            </p>
            <div class="mt-1 space-y-1 ps-5.5 text-toned">
              <p class="text-xs text-muted">
                {{ t('web.prediction.yours') }}
              </p>
              <component
                :is="questions[index]!.form === 'order' ? 'ol' : 'ul'"
                class="space-y-0.5"
                :class="questions[index]!.form === 'order' ? 'list-decimal ps-5' : ''"
              >
                <li
                  v-for="(text, at) in answerText(questions[index]!, answer)"
                  :key="at"
                >
                  <InlineText :text="text" />
                </li>
                <li
                  v-if="!answerText(questions[index]!, answer).length"
                  class="text-muted"
                >
                  {{ t('web.prediction.none') }}
                </li>
              </component>
              <template v-if="!isRight(questions[index]!, answer)">
                <p class="text-xs text-muted">
                  {{ t('web.prediction.actually') }}
                </p>
                <component
                  :is="questions[index]!.form === 'order' ? 'ol' : 'ul'"
                  class="space-y-0.5"
                  :class="questions[index]!.form === 'order' ? 'list-decimal ps-5' : ''"
                  data-testid="prediction-right"
                >
                  <li
                    v-for="(text, at) in rightText(questions[index]!)"
                    :key="at"
                  >
                    <InlineText :text="text" />
                  </li>
                  <li
                    v-if="!rightText(questions[index]!).length"
                    class="text-muted"
                  >
                    {{ t('web.prediction.none') }}
                  </li>
                </component>
              </template>
              <p
                :id="`prediction-rule-${index}`"
                class="rounded-md border-l-2 border-l-info bg-default/60 px-2 py-1"
                data-testid="prediction-rule"
              >
                <InlineText :text="questions[index]!.rule" />
              </p>
            </div>
          </div>
        </template>
      </li>
    </ol>

    <!-- the question on screen -->
    <form
      v-if="question && current !== null"
      :key="question.id"
      class="mt-2"
      data-testid="prediction-form"
      :data-form="question.form"
      @submit.prevent="submit"
    >
      <fieldset class="min-w-0">
        <legend class="text-sm text-highlighted">
          <span
            v-if="questions.length > 1"
            class="me-1 font-mono text-xs text-muted tabular-nums"
          >{{ t('web.prediction.question', { n: current + 1, total: questions.length }) }}</span>
          <InlineText :text="question.prompt" />
        </legend>
        <p class="mt-1 text-xs text-muted">
          {{ t(`web.prediction.how.${question.form}`) }}
        </p>

        <!-- pick one: a radio group -->
        <div
          v-if="question.form === 'one'"
          class="mt-2 space-y-1.5"
        >
          <label
            v-for="option in question.options"
            :key="option.id"
            class="flex cursor-pointer items-start gap-2 rounded-md border border-default bg-default px-2.5 py-1.5 text-sm text-toned has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:outline-2 has-focus-visible:outline-primary"
          >
            <input
              v-model="choice"
              type="radio"
              :name="`prediction-${question.id}`"
              :value="option.id"
              class="mt-1 shrink-0 accent-(--ui-primary) focus-visible:outline-none"
            >
            <InlineText :text="option.text" />
          </label>
        </div>

        <!-- pick lines: a checkbox group -->
        <div
          v-else-if="question.form === 'lines'"
          class="mt-2 space-y-1.5"
        >
          <label
            v-for="option in question.options"
            :key="option.id"
            class="flex cursor-pointer items-start gap-2 rounded-md border border-default bg-default px-2.5 py-1.5 text-sm text-toned has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:outline-2 has-focus-visible:outline-primary"
          >
            <input
              v-model="lines"
              type="checkbox"
              :value="option.id"
              class="mt-1 shrink-0 accent-(--ui-primary) focus-visible:outline-none"
            >
            <InlineText :text="option.text" />
          </label>
        </div>

        <!-- order the lines: Up and Down on each, the moves said aloud -->
        <template v-else>
          <ol
            ref="list"
            class="mt-2 space-y-1.5"
            :aria-label="t('web.prediction.orderList')"
          >
            <li
              v-for="(id, at) in order"
              :key="id"
              :data-line="id"
              class="flex items-start gap-2 rounded-md border border-default bg-default px-2 py-1.5 text-sm text-toned"
              data-testid="prediction-line"
            >
              <span class="mt-0.5 w-4 shrink-0 text-end font-mono text-xs text-muted tabular-nums">{{ at + 1 }}</span>
              <span class="min-w-0 flex-1 break-words"><InlineText :text="optionOf(question, id)?.text ?? id" /></span>
              <span class="flex shrink-0 gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  icon="i-lucide-arrow-up"
                  :aria-label="t('web.prediction.up', { line: plain(optionOf(question, id)?.text ?? id) })"
                  :disabled="at === 0"
                  data-move="-1"
                  @click="move(id, -1)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  icon="i-lucide-arrow-down"
                  :aria-label="t('web.prediction.down', { line: plain(optionOf(question, id)?.text ?? id) })"
                  :disabled="at === order.length - 1"
                  data-move="1"
                  @click="move(id, 1)"
                />
              </span>
            </li>
          </ol>
          <p
            class="sr-only"
            aria-live="polite"
            data-testid="prediction-moved"
          >
            {{ moved }}
          </p>
        </template>
      </fieldset>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-muted">
          {{ last ? t('web.prediction.runsAfter') : t('web.prediction.next') }}
        </p>
        <UButton
          type="submit"
          size="sm"
          color="primary"
          :icon="last ? 'i-lucide-play' : 'i-lucide-check'"
          :label="last ? t('web.prediction.run') : t('web.prediction.answer')"
          :disabled="!valid"
          data-testid="prediction-submit"
        />
      </div>
    </form>
  </section>
</template>
